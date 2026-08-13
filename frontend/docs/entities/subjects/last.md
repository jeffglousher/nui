## LAST

Last message JetStream still has for that name. Core has no stored last message — use `core.subjects[].last_payload` from the snapshot for what was heard while listening.

```
GET /api/connection/:id/subjects/last?subject=:subject&stream=:stream
```

Payload is base64.
