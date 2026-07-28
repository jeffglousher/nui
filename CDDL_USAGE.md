# CBOR + CDDL Message Decoding - Quick Guide

Decode CBOR messages in NATS UI and optionally validate them against CDDL schemas.

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

## Usage

1. **View a binary message** in NATS UI
2. **Select "cbor" formatter** from the format dropdown
3. **System auto-detects** a matching CDDL schema + named rule when possible
4. **See decoded JSON data** (raw CBOR decode works even without a schema)
5. CDDL validation status is shown when a schema + rule are selected

If auto-detection fails, manually select schema and rule.

## Smart Features

- **Topic pattern learning**: `user.123.events.created` → learns `user.*.events.created`
- **Persistent caching**: Remembers successful schema/rule combinations per subject
- **Schema-less decode**: Valid CBOR always decodes to JSON; CDDL is for validation

## Limitations (v1)

- Single-file CDDL schemas (no multi-file `include` graph yet)
- View/decode only — CBOR compose/encode is not in the send UI

## Troubleshooting

- **No decode**: Payload may not be valid CBOR — check hex view
- **CDDL mismatch**: Payload decoded but does not match the selected rule
- **No schemas**: Confirm `.cddl` files are in the correct directory (see Setup)

That's it! Drop `.cddl` files next to your protobuf schemas workflow and pick **cbor** in the formatter list.
