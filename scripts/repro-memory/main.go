// Command repro-memory accelerates NUI memory and disk pressure so the
// live-listen and Badger (#125) problems can be duplicated in minutes.
//
//	go run ./scripts/repro-memory -cmd=badger
//	go run ./scripts/repro-memory -cmd=flood -rate=10000 -size=256 -subjects=1 -duration=30s
//	go run ./scripts/repro-memory -cmd=flood -rate=5000 -size=64 -subjects=20000 -duration=30s
//	go run ./scripts/repro-memory -cmd=listen -subject=flood.> -duration=30s
//
// Flood a local nats-server only. Do not publish onto demo.nats.io.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/dgraph-io/badger/v4"
	"github.com/gorilla/websocket"
	"github.com/nats-io/nats.go"
	docstore "github.com/nats-nui/nui/pkg/storage"
)

func main() {
	cmd := flag.String("cmd", "badger", "badger | flood | listen")
	natsURL := flag.String("nats", "nats://127.0.0.1:4222", "local nats-server URL (never demo.nats.io)")
	nuiURL := flag.String("nui", "http://127.0.0.1:31311", "running NUI HTTP origin")
	subject := flag.String("subject", "flood.>", "listen subject")
	rate := flag.Int("rate", 10000, "publish rate (msgs/sec)")
	size := flag.Int("size", 256, "payload bytes")
	subjects := flag.Int("subjects", 1, "distinct flood.N subjects (1 = same name)")
	duration := flag.Duration("duration", 20*time.Second, "how long to run flood/listen")
	flag.Parse()

	if strings.Contains(*natsURL, "demo.nats.io") {
		fmt.Fprintln(os.Stderr, "refusing to publish onto demo.nats.io")
		os.Exit(2)
	}

	var err error
	switch *cmd {
	case "badger":
		err = runBadger()
	case "flood":
		err = runFlood(*natsURL, *rate, *size, *subjects, *duration)
	case "listen":
		err = runListen(*nuiURL, *natsURL, *subject, *duration)
	default:
		err = fmt.Errorf("unknown -cmd %q", *cmd)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runBadger() error {
	defDir, err := os.MkdirTemp("", "nui-badger-default-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(defDir)
	slimDir, err := os.MkdirTemp("", "nui-badger-slim-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(slimDir)

	fmt.Println("=== DefaultOptions (what NUI used before this change) ===")
	if err := withDB(defDir, badger.DefaultOptions(defDir).WithLoggingLevel(badger.ERROR), true); err != nil {
		return err
	}

	fmt.Println("=== NewDocStore (tuned for a handful of connection docs) ===")
	db, err := docstore.NewDocStore(slimDir)
	if err != nil {
		return err
	}
	reportDir("slim-open", slimDir)
	return db.Close()
}

func withDB(dir string, opts badger.Options, write bool) error {
	db, err := badger.Open(opts)
	if err != nil {
		return err
	}
	if write {
		if err := db.Update(func(txn *badger.Txn) error {
			return txn.Set([]byte("k"), []byte("v"))
		}); err != nil {
			_ = db.Close()
			return err
		}
	}
	reportDir("open", dir)
	if err := db.Close(); err != nil {
		return err
	}
	reportDir("closed", dir)
	return nil
}

func reportDir(label, dir string) {
	var apparent int64
	_ = filepath.Walk(dir, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		apparent += info.Size()
		fmt.Printf("  %-16s ls=%12d\n", filepath.Base(p), info.Size())
		return nil
	})
	out, _ := exec.Command("du", "-sb", dir).Output()
	fmt.Printf("%s apparent=%.2f MiB  du=%s", label, float64(apparent)/(1<<20), string(out))
}

func runFlood(natsURL string, rate, size, subjects int, duration time.Duration) error {
	nc, err := nats.Connect(natsURL, nats.Name("nui-memory-flood"))
	if err != nil {
		return err
	}
	defer nc.Close()

	payload := bytesOf(size)
	interval := time.Second / time.Duration(rate)
	if interval < time.Microsecond {
		interval = time.Microsecond
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	deadline := time.After(duration)
	var sent atomic.Int64
	i := 0
	start := time.Now()
	fmt.Printf("flooding %s at ~%d msg/s  size=%d  subjects=%d  for %s\n", natsURL, rate, size, subjects, duration)
	for {
		select {
		case <-deadline:
			elapsed := time.Since(start).Seconds()
			n := sent.Load()
			fmt.Printf("sent %d in %.1fs (%.0f msg/s)\n", n, elapsed, float64(n)/elapsed)
			return nil
		case <-ticker.C:
			subj := "flood.0"
			if subjects > 1 {
				subj = fmt.Sprintf("flood.%d", i%subjects)
				i++
			}
			if err := nc.Publish(subj, payload); err != nil {
				return err
			}
			sent.Add(1)
		}
	}
}

func bytesOf(n int) []byte {
	if n < 1 {
		n = 1
	}
	b := make([]byte, n)
	for i := range b {
		b[i] = byte('A' + (i % 26))
	}
	return b
}

func runListen(nuiURL, natsURL, subject string, duration time.Duration) error {
	id, err := ensureLocalConnection(nuiURL, natsURL)
	if err != nil {
		return err
	}
	wsURL := strings.Replace(nuiURL, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	wsURL = strings.TrimRight(wsURL, "/") + "/ws/sub?id=" + id

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return fmt.Errorf("ws dial: %w", err)
	}
	defer conn.Close()

	req := map[string]any{
		"type":    "subscriptions_req",
		"payload": map[string]any{"subjects": []string{subject}},
	}
	if err := conn.WriteJSON(req); err != nil {
		return err
	}

	pid := nuiPID()
	var got atomic.Int64
	var bytes atomic.Int64
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			got.Add(1)
			bytes.Add(int64(len(data)))
		}
	}()

	start := time.Now()
	deadline := time.After(duration)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	fmt.Printf("listening via NUI ws  conn=%s  subject=%s  nui_pid=%s\n", id, subject, pid)
	printListenSample(start, pid, &got, &bytes)
	for {
		select {
		case <-deadline:
			_ = conn.Close()
			<-done
			printListenSample(start, pid, &got, &bytes)
			return nil
		case <-ticker.C:
			printListenSample(start, pid, &got, &bytes)
		}
	}
}

func printListenSample(start time.Time, pid string, got, bytes *atomic.Int64) {
	elapsed := time.Since(start).Seconds()
	n := got.Load()
	rate := 0.0
	if elapsed > 0 {
		rate = float64(n) / elapsed
	}
	fmt.Printf("t=%.0fs  ws_msgs=%d  %.0f/s  ws_bytes=%.1f MiB  nui_rss_kb=%s  db=%s\n",
		elapsed, n, rate, float64(bytes.Load())/(1<<20), rssKB(pid), dbFootprint("/tmp/nui-demo"))
}

func ensureLocalConnection(nuiURL, natsURL string) (string, error) {
	host := strings.TrimPrefix(strings.TrimPrefix(natsURL, "nats://"), "tls://")
	resp, err := http.Get(strings.TrimRight(nuiURL, "/") + "/api/connection")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	var conns []struct {
		ID    string   `json:"id"`
		Name  string   `json:"name"`
		Hosts []string `json:"hosts"`
	}
	if err := json.Unmarshal(body, &conns); err != nil {
		return "", err
	}
	for _, c := range conns {
		if c.Name == "local-flood" {
			return c.ID, nil
		}
		for _, h := range c.Hosts {
			if h == host || h == "127.0.0.1:4222" || h == "localhost:4222" {
				if !strings.Contains(strings.Join(c.Hosts, ","), "demo.nats.io") {
					return c.ID, nil
				}
			}
		}
	}
	payload := fmt.Sprintf(`{"name":"local-flood","hosts":["%s"],"subscriptions":[],"auth":[]}`, host)
	resp, err = http.Post(strings.TrimRight(nuiURL, "/")+"/api/connection", "application/json", strings.NewReader(payload))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("create connection: %s %s", resp.Status, b)
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&created); err != nil {
		return "", err
	}
	return created.ID, nil
}

func nuiPID() string {
	out, err := exec.Command("fuser", "31311/tcp").CombinedOutput()
	if err != nil {
		return ""
	}
	fields := strings.Fields(string(out))
	for i := len(fields) - 1; i >= 0; i-- {
		if _, err := strconv.Atoi(fields[i]); err == nil {
			return fields[i]
		}
	}
	return ""
}

func rssKB(pid string) string {
	if pid == "" {
		return "?"
	}
	if n, err := strconv.Atoi(pid); err != nil || n <= 0 {
		return "?"
	}
	out, err := exec.Command("ps", "-o", "rss=", "-p", pid).Output()
	if err != nil {
		return "?"
	}
	return strings.TrimSpace(string(out))
}

func dbFootprint(dir string) string {
	out, err := exec.Command("du", "-sh", dir).Output()
	if err != nil {
		return "?"
	}
	return strings.TrimSpace(string(out))
}
