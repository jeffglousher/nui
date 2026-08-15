# SUBJECTS discovery

A subject is a name a message travels on, like `orders.created`.

This card answers one question: **what names exist right now?** It is not MESSAGES and it is not STREAMS. Core vs JetStream is the only split.

## What you see

The first paint is a **family list** — the first token of each name (`orders`, `ghost`, `$KV`). Folders start closed. That is the stream-shaped view. Notification leaves (heartbeats, keys, NMEA sentences) stay behind a door until you open one.

Open a family and you get **one more level**. A normal name stays one child (`orders` → `created`). Anything deeper is a **partial stack** on one row (`hb.cc.getbygenius.digimasons-2`), never a hallway of folders. A live prefix (`foo.bar` plus `foo.bar.x`) stays two rows. Only a pattern or bucket you open with ▸ nests stored names underneath.

Open a name with a ▸ (a JetStream pattern, KV bucket, or object store). Stored names load **under that row**, still stacked if they are deep. `live` means we heard it during a listen. Core does not keep a last message.

FIND and reload sit in the header, same as STREAMS. CORE / JETSTREAM are view filters in the card, not header actions. FIND opens matching families so the leaf is visible. Reload and poll sample again. Open folders stay open. Click a name to watch **that** name in MESSAGES — it replaces what MESSAGES is listening to and starts a fresh log for that name. A family or stream pattern watches the prefix (`foo.>`), not the bare token. Add more names in the MESSAGES subject list. The ▸ opens a folder; the name is what you watch. Hover a row (or the watched row) to copy the same name MESSAGES will listen to. Names use the same monospace 12px as the STREAMS table. A chip appears only when it adds a fact (`live`, `KV`, `FILES`, or a stream whose name is not the row). The footer stays quiet unless something failed or was capped.

## Core vs JetStream

| | Core | JetStream |
|---|---|---|
| How we know | Listen for a few seconds | Read stream capture names |
| Memory | Forgets anything before the listen | Keeps what the stream is set to keep |
| Empty | Quiet, not broken | No capture names, or none stored yet |

`ALL` / `>` is how you look around. Type `orders.>` to narrow. Busy lists are capped.

## Demo

STREAMS is a table of keepers. MESSAGES is a live log. SUBJECTS is a catalog of names.

On `demo.nats.io` the card opens as a closed family list. Open `ghost` for stacked live children (`bd.gga`). Open `cox` for `dealer` and `inventory.details`. FIND `gga` reveals the path. The love GIF on the pull request walks that comparison, then the tree.

## What this card will not do

- It will not open the whole tree for you.
- It will not treat a catch-all as a mistake.
- It will not show payloads in the catalog.
- It will not invent MQTT, KV, or Object as a third mode. Those are JetStream stores with a small chip.
- It will not keep its own watch list. A catalog click is a picker for the MESSAGES listen set, not a second subscription store.

## API

See [index.md](./index.md) and [last.md](./last.md).
