## INDEX

Discovery is two requests. JetStream returns capture patterns immediately. Core listens only when you give it a real name, on its own connection, then unsubscribes. Neither response includes payloads.

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
GET /api/connection/:id/subjects/core?filter=orders.>&listen_ms=2000
```

`filter` is required. `>` and other catch-alls are rejected. Uses a short-lived connection, not the pooled MESSAGES connection.

### OCCUPIED NAMES

```
GET /api/connection/:id/subjects/jetstream/:stream/occupied?filter=orders.>
```

Names that currently have messages in that stream, capped per stream.
