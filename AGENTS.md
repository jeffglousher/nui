# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
NUI is a NATS management GUI (`github.com/nats-nui/nui`). One codebase, two build targets that share a Go backend and a React/Vite frontend:
- Web app — Fiber HTTP/WebSocket server. Entry point `cmd/server/main.go`. This is the target to run/test in the cloud.
- Desktop app — Wails v2 (Go + embedded webview). Entry point `main.go`. It needs webkit2gtk + a GUI, so it is not runnable headless here; prefer the web target.

Standard commands live in `README.md` and the root `Makefile`; CI steps are in `.github/workflows/build-and-test.yml`.

### Toolchain notes
- README/CI pin Node 18, but the default Node 22 on the VM installs, builds, and tests the frontend fine.
- `go.mod` requires `go >= 1.25`; the Go toolchain auto-downloads the right version, so the first `go` command may pause to fetch it.

### Non-obvious build/run gotchas
- `main.go` has `//go:embed all:frontend/dist-app`, so `go build ./...`, `go vet ./...`, and `go test ./...` all fail to compile unless `frontend/dist-app` exists. The startup update script creates a `frontend/dist-app/sample.txt` placeholder (same trick as CI) so these work out of the box. For real desktop assets run `npm --prefix frontend run build-desktop`. Note `dist-app/` is gitignored except `.gitkeep`, and `sample.txt` is ignored, so the placeholder does not dirty `git status`.
- The web server serves `./frontend/dist` via a path relative to the working directory, so run it from the repo root and build the frontend first. `make dev-web` does both: it runs `npm --prefix frontend run build` then `go run cmd/server/main.go --db-path=db`. The web UI listens on `:31311` (health check at `GET /health`). Running the web server via `cmd/server` does NOT require `dist-app` (only the desktop `main.go` embeds it).
- Reinstalling frontend deps does not affect an already-running Go server; rebuild the frontend (`npm --prefix frontend run build`) to pick up frontend changes, and restart `go run` for backend changes (no hot reload in web mode).

### Lint / test
- Backend tests: `go test ./...` — self-contained. They embed their own NATS server (`pkg/testserver`) and use an in-memory DB, so no external services are needed.
- Frontend tests: `npx vitest run` (`npm test` is watch mode).
- Pre-existing issues (not caused by setup, don't try to "fix" as part of env work): `go vet ./...` reports two `fmt.Errorf` warnings in `pkg/testserver/testserver.go`, and `npm run typescript` (tsc) reports many type errors. Typecheck is not part of the build — the Vite build uses SWC and does not typecheck — so `npm --prefix frontend run build` still succeeds. There is no ESLint/golangci-lint config.

### Running the app end-to-end
To do anything useful you connect NUI to a running NATS server (there is no built-in broker; NUI is just the client/GUI). NATS is not preinstalled. Quickest option without Docker:
- `go install github.com/nats-io/nats-server/v2@v2.12.7`, then run `"$(go env GOPATH)"/bin/nats-server -js -m 8222` (client on `:4222`, monitoring on `:8222`).
- Alternatively `docker compose up` brings up NATS (+ a TLS-secured NATS and the prebuilt `nui` image), but Docker is not preinstalled.

In the NUI web UI: open the CONNECTIONS panel (lightning-bolt icon, top-left) → NEW → set NAME and HOST `localhost:4222` → CREATE, then click the connection to connect. To watch messages, open the connection's MESSAGES view → SUBJECTS and add a subject (e.g. `test.subject`) before publishing (NATS core is not persistent, so subscribe first). The "add subject" (+) control in the SUBJECTS dialog is a faint bar and easy to miss; if pixel-clicking fails, click it via the DevTools console with `document.querySelector('[class*="btt_new"]').click()`. Use SEND to publish.
