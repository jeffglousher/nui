## INDEX

Discovery is two requests. JetStream returns capture names immediately. Core listens on a dedicated connection, then unsubscribes. An empty filter means `>` — that is how you look around. Neither response includes payloads. Busy lists are capped.

### JETSTREAM PATTERNS

```
GET /api/connection/:id/subjects/jetstream
```

| name | default | meaning |
|---|---|---|
| `discard_sys` | `true` | hide `$SYS`, `$JS.`, `_INBOX` (not `$KV` / `$O`) |

`$KV` and `$O` collapse to one bucket node. Occupied names are a separate call.

### CORE LISTEN

```
GET /api/connection/:id/subjects/core?filter=>&listen_ms=2000
```

`filter` defaults to `>`. Catch-alls are allowed. Uses a short-lived connection, not the pooled MESSAGES connection. Name count and listen window are capped.

### OCCUPIED NAMES

```
GET /api/connection/:id/subjects/jetstream/:stream/occupied?filter=orders.>
```

Names that currently have messages in that stream, capped per stream.
