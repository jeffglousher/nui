# Long-running stability

NUI used to look like it “grew a 2GB logfile” and to get heavy after a busy
MESSAGES listen. Those are three different problems. This document is how to
duplicate them quickly and what the code does about each.

Do not publish onto `demo.nats.io`. Use a local `nats-server`.

## 1. Docker `000001.vlog` is ~2GiB — [nats-nui/nui#125](https://github.com/nats-nui/nui/issues/125)

This is not a logfile. Clover stores connections in Badger. Badger
`DefaultOptions` sets `ValueLogFileSize` to 1GiB−1, and `createVlogFile`
truncates each `*.vlog` to **`2 * ValueLogFileSize`** (~2GiB) the moment the
DB opens. On this host that is real disk (`du`), not a sparse hole. A clean
`Close()` truncates the file back to the bytes actually written (~20B plus a
1MiB `DISCARD`). A running container — or a crash that skips `Close` — is
what `ls -lh` reports as 2.0G.

NUI only stores a handful of connection documents, so `pkg/storage/docstore.go`
now opens Badger with an 8MiB value log (16MiB mmap), small memtables, and an
8MiB block cache. While open the catalog is ~21MiB instead of ~2.1GiB.

Duplicate:

```
go run ./scripts/repro-memory -cmd=badger
```

Measured on this host (Badger v4.2.0):

| | `ls` while open | `du` blocks while open | after clean Close |
|---|---|---|---|
| DefaultOptions | 2.18GiB (`000001.vlog` 2147483646 + 128MiB mem) | often sparse (48K here); Docker ext4 may allocate the 2GiB | ~1MiB |
| Tuned NewDocStore | 21MiB (16MiB vlog + 4MiB mem) | ~21MiB | ~1MiB |

The live NUI process using `--db-path=/tmp/nui-demo` matches the default column: `ls` 2.0G on `000002.vlog`, `du -s` 48K. High-rate publishes do **not** grow that file.

## 2. High-rate MESSAGES listen

A catalog click or the MESSAGES card subscribes over `/ws/sub`. Each NATS
message is JSON+base64 on the websocket, `atob`’d in the browser, then pushed
into an in-memory array. The old path copied that array on every message,
never trimmed the per-subject `stats` map, and blocked the Go relay when the
browser fell behind (NATS pending then grew toward 64MiB).

Now:

- the browser flushes the tail every 50ms and keeps the newest 8000 rows
- `stats` keeps at most 2000 subjects
- the Go relay drops when the websocket writer is behind
- FanIn closes its output when subscriptions drain, so changing the listen
  set does not leak a goroutine per change

Duplicate (local nats-server on 4222, NUI on 31311):

```
# same subject, large payload — grows the message tail
go run ./scripts/repro-memory -cmd=flood -rate=10000 -size=256 -subjects=1 -duration=30s

# many distinct names — used to grow stats without bound
go run ./scripts/repro-memory -cmd=flood -rate=5000 -size=64 -subjects=20000 -duration=30s

# measure NUI RSS + websocket intake (does not need the browser)
# quote flood.> so the shell does not treat > as a redirect
go run ./scripts/repro-memory -cmd=listen -subject='flood.>' -duration=30s
```

Measured through `/ws/sub` on the running NUI (old binary, local nats-server :4222, not demo.nats.io):

- ~1.1k msg/s relayed (publisher ~1.3–1.7k msg/s)
- 12s same-subject flood: 12.7k messages, 5.7MiB websocket, NUI RSS **flat** at ~57MiB
- 12s 20k-distinct-name flood: 11.4k messages, RSS +1.7MiB
- `--db-path` value log **unchanged**

The Go process is not the high-rate heap. The browser is: `addMessage` used to copy the whole array on every message, `stats` grew one entry per distinct subject, and `try_connecting` filled the in-app log. Open MESSAGES on `local-flood` and listen on `flood.>` while flooding to watch Chrome.

Open MESSAGES on the `local-flood` connection and listen on `flood.>` to watch
the Chrome heap. The 20k-row cap still copies; the 50ms batch is what keeps
the UI from applying 10k React updates a second.

## 3. `try_connecting` every ~3s

Also reported on #125. The browser websocket reconnects forever on a dead
host and used to write an in-app log line (and persist the whole log on
refresh) for every attempt. That is not a Badger write.

Reconnect delay now backs off (3s → 30s). `try_connecting` is not logged on
every attempt. The in-app log is capped at 5000 lines; only the last 200 are
saved across reload.

## Observe

- Disk: `ls -lh` / `du -sh` on `--db-path` while NUI is **running**
- Goroutines: `go test ./internal/ws/ -run TestHub_NoGoroutineLeakOnSubscriptionChurn -v`
- Value log: `go test ./pkg/storage/ -run TestDocStore -v`
- Browser: Chrome task manager / `performance.memory` after a 30s flood
