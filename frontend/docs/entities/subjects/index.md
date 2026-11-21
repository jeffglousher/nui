## SUBJECTS

The SUBJECTS card lists JetStream capture patterns, stored subject names and
Core subjects observed during a sample. Expanding a JetStream pattern or bucket
loads its stored subjects. Select a subject and open live messages or choose a
stream to view its retained messages in the existing message cards.

Enter a subject filter or choose ALL (`>`), then select SAMPLE to observe Core
traffic for two seconds. Quiet subjects may not appear. Opening SUBJECTS and
refreshing the JetStream catalog do not start a Core sample. The default filter
hides `$SYS`, `$JS` and `_INBOX`. KV and Object Store subjects remain visible.

### JetStream catalog

```
GET /api/connection/:id/subjects/jetstream
GET /api/connection/:id/subjects/jetstream/:stream/occupied?filter=orders.>
```

The catalog contains capture patterns, with KV and Object Store patterns grouped by bucket. Occupied subjects are fetched separately from the first server page, sorted and capped per stream. Responses mark incomplete lists with `truncated`. Catalogs do not include message payloads.

Streams that transform subject names report a limitation when expanding a capture pattern: incoming subjects cannot reliably identify stored subjects. A stream-wide occupied request (`filter=>`) remains available. Mirrors and sources without capture patterns are not listed in this catalog.

### Core discovery

```
GET /api/connection/:id/subjects/core?filter=orders.>&listen_ms=2000
```

Sampling requires a valid subject filter and returns observed names and counts.
All catalog requests accept `discard_sys=false` to include internal subjects.
