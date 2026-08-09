# Long-running stability

NUI is designed to run continuously. This note records the reliability
properties that keep memory and log usage bounded over long uptimes, and how
each is verified.

## Bounded WebSocket relay lifecycle
Each active subscription is relayed to the browser by a goroutine tied to the
lifetime of its subscription channels. When subscriptions change or a client
disconnects, the relay terminates and its goroutine is released.
- Mechanism: `pkg/channels/fanin.go` closes its merged output once all inputs drain, so the relay in `internal/ws/hub.go` returns when subscriptions are purged.
- Verified by `internal/ws/leak_test.go`: 50 subscribe/purge cycles followed by a disconnect return the goroutine count to its baseline (passes under `-race`).

## Bounded metrics polling
Metrics polling uses a ticker that is stopped when polling ends, so enabling and
disabling metrics leaves no residual timers.
- `internal/metrics/collector.go` uses `time.NewTicker` with `Stop()` on exit.

## Bounded log output
- Request logging records API, websocket, and navigation traffic; high-frequency health checks and static-asset fetches are skipped so logs stay signal-rich (`internal/nui/server.go`).
- File logging is size-capped and rotates into a single backup (default 50 MiB active + one backup), keeping the on-disk footprint bounded (`pkg/logging/rotatingwriter.go`).
- Verified by `pkg/logging/rotatingwriter_test.go`: writing 100x the cap keeps the footprint at ~2x the cap and preserves the most recent lines.

## Bounded in-browser retention
- Connection messages are capped (20000) with trim on overflow (`frontend/src/stores/stacks/connection/messages/index.ts`).
- Stream-message pagination is capped (20000), trimming the off-screen side so paging boundaries are preserved (`frontend/src/stores/stacks/streams/messages.ts`).
- The in-app log store is capped (5000) (`frontend/src/stores/log/index.ts`).

## How to observe
- Goroutines: run `go test ./internal/ws/ -run TestHub_NoGoroutineLeakOnSubscriptionChurn -v` to see the baseline and post-churn counts return to baseline.
- Logs: run the web server with `--log-output=/tmp/nui.log` under normal traffic; the file stays bounded and health/static requests are not logged.
