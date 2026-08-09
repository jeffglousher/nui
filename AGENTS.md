# AGENTS.md

Guidance for any automation or agent (and for humans) working in this repo. NUI
is a NATS management GUI: one Go backend plus one React/Vite frontend, shipped as
a web app (`cmd/server/main.go`) and a desktop app (Wails, `main.go`).

## Operating principles
- Ship working software, proven at runtime: exercise the actual feature end to end and confirm the exact result you expected.
- Prefer evidence: a real screenshot, log line, or test result over an assertion. Reproduce the starting condition, make the change, then reproduce success.
- Be tenacious: the whole stack runs locally with no external accounts, so there is always a route to a green result — keep going until you reach it.
- Leave it better: when you touch an area, tighten it and keep the docs sharp.

## Repo map
- Web entry: `cmd/server/main.go` — Fiber HTTP/WebSocket server, serves the built UI, listens on `:31311` (`GET /health` returns `ok`).
- Desktop entry: `main.go` — Wails app; embeds `frontend/dist-app`.
- Backend: `internal/` and `pkg/`.
- Frontend: `frontend/` — React 18 + Vite 6 + TypeScript, tests in Vitest.
- Ports: UI `31311`, NATS client `4222`, NATS monitoring `8222`.

## Setup
- Frontend deps: `npm install --prefix frontend`
- Go deps: `go mod download`
- The desktop entry embeds `frontend/dist-app`, so ensure that directory exists before compiling the whole module: build the desktop assets with `npm --prefix frontend run build-desktop`, or create it once with `mkdir -p frontend/dist-app && touch frontend/dist-app/sample.txt`. With it present, `go build ./...` and `go test ./...` are green.

## Run the web app
From the repo root:
```
npm --prefix frontend run build
go run cmd/server/main.go --db-path=db
```
`make dev-web` runs the build and the server together. Open http://localhost:31311 (`GET /health` returns 200). The server reads the built UI from `./frontend/dist` relative to the working directory, so launch it from the repo root. State persists in `db/`; pass `--db-path=:memory:` for a throwaway instance.

## Run end to end with a live broker
NUI is the client/GUI; point it at a running NATS server. Stand one up locally, no accounts required:
```
go install github.com/nats-io/nats-server/v2@v2.12.7
"$(go env GOPATH)"/bin/nats-server -js -m 8222
```
`-js` enables JetStream (streams and KV); `-m 8222` exposes monitoring (`GET /healthz`). Then in the UI:
- Connect: lightning-bolt icon (top-left) → NEW → set NAME and HOST `localhost:4222` → CREATE → click the connection (green check = connected).
- Core pub/sub: MESSAGES → SUBJECTS, add a subject (e.g. `demo.>`) → SEND, publish subject `demo.test` with a payload → it lands in the messages list. Subscribe before publishing.
- JetStream stream: STREAMS → NEW → NAME `DEMO_STREAM`, subject `demo.>` → CREATE. Publish to `demo.test`; the stream stores and lists the message.
- KV store: BUCKETS → NEW → NAME `DEMO_KV` → CREATE → open it → NEW entry → KEY `greeting`, VALUE any → CREATE → the entry is listed and readable back.

To add a subject row from the browser console: `document.querySelector('[class*="btt_new"]').click()` — a freshly added row auto-focuses, so just type the value.

## Test
- Backend: `go test ./...` — self-contained; it starts an embedded NATS server and uses an in-memory DB, so no external services are needed.
- Frontend: `npx vitest run` (the `test` script is watch mode).
- Frontend build: `npm --prefix frontend run build` (web → `frontend/dist`) and `npm --prefix frontend run build-desktop` (desktop → `frontend/dist-app`).

## Toolchain
- Go: `go.mod` targets `go >= 1.25`; the toolchain fetches the matching version automatically.
- Node: Node 22 installs, builds, and tests the frontend.
