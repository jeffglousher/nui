## INDEX

One discovery pass for a connection, then every subscription is released.

- **JetStream**: names already stored in streams.
- **Core**: names heard while listening, then the listen stops. Core does not remember the past.

### URL

```
GET /api/connection/:id/subjects
```

### QUERY

| name | default | meaning |
|---|---|---|
| `core` | `true` | listen, then unsubscribe |
| `jetstream` | `true` | list stored stream subjects |
| `listen_ms` | `2000` | core listen window (200–10000) |
| `filter` | `>` | core subscribe filter |
| `discard_sys` | `true` | hide `$SYS`, `$JS.`, `_INBOX` (not `$KV` / `$O`) |

### RESPONSE

`core.subjects[].last_payload` is base64, capped. `dropped` is messages the listen could not keep. `truncated` means the name list was capped. `jetstream.failed` is streams that could not be read.
