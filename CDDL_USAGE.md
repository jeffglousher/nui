# CBOR + CDDL Messages - Quick Guide

Read and write CBOR messages in NATS UI, optionally checked against your own CDDL schemas.

## Setup

1. **Locate the schemas directory**:

   **Desktop App:**
   - **Windows**: `%LOCALAPPDATA%\nui-app\cddlschemas\default`
   - **Linux**: `~/.local/share/nui-app/cddlschemas/default`
   - **macOS**: `~/Library/Application Support/nui-app/cddlschemas/default`

   **Docker/Container:**
   - Path inside container: `/cddlschemas/default`
   - Usage: Mount your local schemas folder to this path.
   - Flag: `--cddl-schemas-path=/path/to/cddlschemas/default`

2. **Add your `.cddl` files** to this directory:
```
default/
├── person.cddl
├── product.cddl
└── events/
    └── order.cddl
```

3. **Example schema**:
```cddl
; person.cddl
person = {
  name: tstr,
  age: uint,
  email: tstr,
}
```

## Reading messages

1. **View a binary message** in NATS UI
2. **Select "cbor" formatter** from the format dropdown
3. **System auto-detects** a CDDL schema + named rule the payload matches
4. **See decoded JSON data** — a valid CBOR payload always decodes, with or without a schema
5. When a rule is selected the CDDL verdict is shown next to the data

If auto-detection finds no match, nothing is selected and the payload is shown as plain CBOR:
pick a schema and rule by hand to check it against one.

### How CBOR types are shown

JSON has no syntax for part of the CBOR model, so those values are written the way CBOR
diagnostic notation writes them, rather than being dropped:

| CBOR | shown as |
|------|----------|
| byte string | `"h'deadbeef'"` |
| bignum | `"18446744073709551616"` |
| unassigned simple value | `"simple(19)"` |
| tagged value | `{ "tag": 999, "value": ... }` |
| map with keys that are not text | `[[1, "x"], [2, "y"]]` |
| `undefined` | `null` |

## Sending messages

1. Open **SEND MESSAGE** (or the request/reply card) and pick **cbor** in the format dialog
2. **Write the payload as diagnostic notation** — JSON is a subset of it, so plain JSON works:
```
{"name": "ada", "age": 36}
```
   Notation JSON does not have is available too: `h'deadbeef'`, `999("payload")`, `{1: "x"}`
3. **SEND** encodes the text to CBOR and publishes the bytes

The text is encoded, not sent as text. When it cannot be encoded the message is not sent and the
reason is shown in a snackbar.

## Smart Features

- **Topic pattern learning**: `user.123.events.created` → learns `user.*.events.created`
- **Persistent caching**: Remembers matching schema/rule combinations per subject
- **Schema-less decode**: Valid CBOR always decodes to JSON; CDDL only adds a verdict

## Testing

### Automated

```bash
# frontend: decoding, encoding, CDDL verdicts, subject cache
cd frontend && npx vitest run src/utils/cbor src/utils/editor.test.ts

# backend: schema repository and the /api/cddl endpoints
go test ./internal/cddlschema/...
go test ./tests/ -run 'TestNuiTestSuite/TestCddlschemas'
```

There is also an end-to-end check that publishes through the running API and reads the bytes
back from JetStream. It is skipped unless `NUI_E2E` is set, since it needs the whole stack:

```bash
nats-server -js
go run ./cmd/server --cddl-schemas-path=./cddlschemas/default   # with person.cddl in it
cd frontend && NUI_E2E=1 npx vitest run src/utils/cbor/e2e.test.ts
```

What the suites cover:

| Area | Covered by |
|------|------------|
| decode without CDDL, including the types JSON cannot hold | `frontend/src/utils/cbor/index.test.ts` |
| decode with CDDL: match, mismatch, unknown rule, broken schema | `frontend/src/utils/cbor/index.test.ts` |
| encode, and refusing text that cannot be sent | `frontend/src/utils/cbor/index.test.ts`, `frontend/src/utils/editor.test.ts` |
| learning and forgetting a subject → schema mapping | `frontend/src/utils/cbor/CddlTopicCache.test.ts` |
| reading schemas from disk, nested ids, ids leaving the directory | `internal/cddlschema/filesystem_repo_test.go` |
| `/api/cddl` listing, single schema, raw content, 404s | `tests/nui_test.go` |
| a payload surviving the round trip through NATS | `frontend/src/utils/cbor/e2e.test.ts` |

The backend suite reads its schemas from `tests/cddlschemas/default`.

### By hand, without CDDL

1. Leave the schemas directory empty (or ignore whatever is in it)
2. In **SEND MESSAGE**, pick **cbor** and send `{"name": "ada", "age": 36}` to a subject you are subscribed to
3. In the messages list, pick **cbor** as the format

The row shows the decoded JSON and no schema line, since nothing was selected. Sending
`h'deadbeef'` instead shows `"h'deadbeef'"`, which is how a byte string is written.
Sending a payload that is not CBOR at all — publish text with the **text** format, then read it
back as **cbor** — reports a decode failure instead of data.

### By hand, with CDDL

1. Drop `person.cddl` (above) into the schemas directory
2. Send `{"name": "ada", "age": 36, "email": "ada@example.com"}` as **cbor**
3. Read the message back: `person` is auto-detected and the header reports the payload as valid
4. Send `{"name": "ada", "age": -3, "email": "ada@example.com"}`

The second message still shows its data, with the mismatch reported next to it
(`/age: value for 'age' does not match`). Selecting `person` in the send card before publishing
refuses the message instead, before it reaches the server.

## Limitations

- Single-file CDDL schemas (no multi-file `include` graph yet)
- Generic rules (`envelope<t> = ...`) cannot be selected: they have nothing to bind their
  parameters from. Reference them from a concrete rule and select that one
- The send cards encode CBOR; saving a KV entry does not
- A payload is one CBOR item: sequences (RFC 8742) are read, but not written

## Troubleshooting

- **No decode**: Payload may not be valid CBOR — check hex view
- **CDDL mismatch**: Payload decoded but does not match the selected rule
- **No schemas**: Confirm `.cddl` files are in the correct directory (see Setup)
- **Message not sent**: The editor text is not valid diagnostic notation, or it does not match
  the selected rule

That's it! Drop `.cddl` files next to your protobuf schemas workflow and pick **cbor** in the formatter list.
