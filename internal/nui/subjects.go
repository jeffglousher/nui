package nui

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/nats-nui/nui/internal/ws"
)

const (
	defaultListenMs     = 2000
	minListenMs         = 200
	maxListenMs         = 10000
	maxCoreSubjects     = 5000
	maxJSStreams        = 500
	maxJSSubjects       = 20000
	maxPayloadBytes     = 4096
	coreSubscribeBuffer = 1024
	jsInfoConcurrency   = 8
)

type SubjectsSnapshot struct {
	CapturedAt time.Time          `json:"captured_at"`
	Core       *CoreSnapshot      `json:"core"`
	JetStream  *JetStreamSnapshot `json:"jetstream"`
}

type CoreSnapshot struct {
	Enabled   bool          `json:"enabled"`
	Filter    string        `json:"filter"`
	ListenMs  int           `json:"listen_ms"`
	Heard     int           `json:"heard"`
	Truncated bool          `json:"truncated"`
	Dropped   int           `json:"dropped,omitempty"`
	Error     string        `json:"error,omitempty"`
	Subjects  []CoreSubject `json:"subjects"`
}

type CoreSubject struct {
	Subject     string              `json:"subject"`
	Count       int                 `json:"count"`
	LastPayload []byte              `json:"last_payload,omitempty"`
	LastAt      time.Time           `json:"last_at"`
	Headers     map[string][]string `json:"headers,omitempty"`
}

type JetStreamSnapshot struct {
	Enabled   bool              `json:"enabled"`
	Error     string            `json:"error,omitempty"`
	Failed    int               `json:"failed,omitempty"`
	Truncated bool              `json:"truncated,omitempty"`
	Streams   []JetStreamStream `json:"streams"`
}

type JetStreamStream struct {
	Name     string             `json:"name"`
	Subjects []JetStreamSubject `json:"subjects"`
}

type JetStreamSubject struct {
	Subject string `json:"subject"`
	Count   uint64 `json:"count"`
}

// HandleSubjectsSnapshot takes one discovery pass and then releases every
// subscription. JetStream is listed from stored stream state. Core is sampled
// by listening, then unsubscribing.
func (a *App) HandleSubjectsSnapshot(c *fiber.Ctx) error {
	if c.Params("id") == "" {
		return c.Status(422).JSON("id is required")
	}
	conn, err := a.nui.ConnPool.Get(c.Params("id"))
	if err != nil {
		return a.logAndFiberError(c, err, 404)
	}

	wantCore := queryBoolDefault(c, "core", true)
	wantJS := queryBoolDefault(c, "jetstream", true)
	discardSys := queryBoolDefault(c, "discard_sys", true)
	filter := strings.TrimSpace(c.Query("filter"))
	if filter == "" {
		filter = ">"
	}
	listenMs := queryIntDefault(c, "listen_ms", defaultListenMs)
	if listenMs < minListenMs {
		listenMs = minListenMs
	}
	if listenMs > maxListenMs {
		listenMs = maxListenMs
	}

	budget := time.Duration(listenMs)*time.Millisecond + 3*time.Second
	if budget < 8*time.Second {
		budget = 8 * time.Second
	}
	ctx, cancel := context.WithTimeout(c.Context(), budget)
	defer cancel()

	out := SubjectsSnapshot{CapturedAt: time.Now().UTC()}
	if !wantCore && !wantJS {
		out.Core = &CoreSnapshot{Enabled: false, Filter: filter, ListenMs: listenMs, Subjects: []CoreSubject{}}
		out.JetStream = &JetStreamSnapshot{Enabled: false, Streams: []JetStreamStream{}}
		return c.JSON(out)
	}

	var jsSnap *JetStreamSnapshot
	var coreSnap *CoreSnapshot
	var wg sync.WaitGroup

	if wantJS {
		wg.Add(1)
		go func() {
			defer wg.Done()
			jsSnap = a.enumerateJetStream(ctx, c.Params("id"), discardSys)
		}()
	} else {
		jsSnap = &JetStreamSnapshot{Enabled: false, Streams: []JetStreamStream{}}
	}

	if wantCore {
		wg.Add(1)
		go func() {
			defer wg.Done()
			coreSnap = sampleCore(ctx, conn.Conn, filter, time.Duration(listenMs)*time.Millisecond, discardSys)
		}()
	} else {
		coreSnap = &CoreSnapshot{Enabled: false, Filter: filter, ListenMs: listenMs, Subjects: []CoreSubject{}}
	}
	wg.Wait()
	out.JetStream = jsSnap
	out.Core = coreSnap
	return c.JSON(out)
}

// HandleSubjectLast returns the last stored JetStream message for a subject.
// Core has no stored last message.
func (a *App) HandleSubjectLast(c *fiber.Ctx) error {
	if c.Params("id") == "" {
		return c.Status(422).JSON("id is required")
	}
	subject := strings.TrimSpace(c.Query("subject"))
	if subject == "" {
		return c.Status(422).JSON("subject is required")
	}
	streamName := strings.TrimSpace(c.Query("stream"))
	if streamName == "" {
		return c.Status(422).JSON("stream is required")
	}

	js, ok, err := a.jsOrFailWithID(c)
	if !ok {
		return err
	}
	stream, err := js.Stream(c.Context(), streamName)
	if err != nil {
		return a.logAndFiberError(c, err, 422)
	}
	raw, err := stream.GetLastMsgForSubject(c.Context(), subject)
	if err != nil {
		return a.logAndFiberError(c, err, 404)
	}
	return c.JSON(ws.NatsMsg{
		Subject:    raw.Subject,
		Payload:    capPayload(raw.Data),
		SeqNum:     raw.Sequence,
		ReceivedAt: raw.Time,
		Headers:    cloneHeader(raw.Header),
	})
}

func (a *App) jsOrFailWithID(c *fiber.Ctx) (jetstream.JetStream, bool, error) {
	conn, err := a.nui.ConnPool.Get(c.Params("id"))
	if err != nil {
		return nil, false, a.logAndFiberError(c, err, 422)
	}
	js, err := jetstream.New(conn.Conn)
	if err != nil {
		return nil, false, a.logAndFiberError(c, err, 422)
	}
	return js, true, nil
}

func (a *App) enumerateJetStream(ctx context.Context, connectionID string, discardSys bool) *JetStreamSnapshot {
	out := &JetStreamSnapshot{Enabled: true, Streams: []JetStreamStream{}}
	conn, err := a.nui.ConnPool.Get(connectionID)
	if err != nil {
		out.Error = jsUserError(err)
		return out
	}
	js, err := jetstream.New(conn.Conn)
	if err != nil {
		out.Error = jsUserError(err)
		return out
	}

	names, err := collectStreamNames(ctx, js)
	if err != nil {
		out.Error = jsUserError(err)
		return out
	}
	if len(names) > maxJSStreams {
		out.Truncated = true
		names = names[:maxJSStreams]
	}

	type result struct {
		stream JetStreamStream
		err    error
	}
	results := make([]result, len(names))
	sem := make(chan struct{}, jsInfoConcurrency)
	var wg sync.WaitGroup
	var subjectBudget atomic.Int64
	var truncated atomic.Bool
	subjectBudget.Store(maxJSSubjects)

	for i, name := range names {
		wg.Add(1)
		go func(i int, name string) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				results[i].err = ctx.Err()
				return
			}
			defer func() { <-sem }()

			stream, err := js.Stream(ctx, name)
			if err != nil {
				results[i].err = err
				return
			}
			info, err := stream.Info(ctx, jetstream.WithSubjectFilter(">"))
			if err != nil {
				results[i].err = err
				return
			}
			entry := JetStreamStream{Name: info.Config.Name, Subjects: []JetStreamSubject{}}
			for subject, count := range info.State.Subjects {
				if discardSys && isInternalSubject(subject) {
					continue
				}
				if subjectBudget.Add(-1) < 0 {
					truncated.Store(true)
					continue
				}
				entry.Subjects = append(entry.Subjects, JetStreamSubject{Subject: subject, Count: count})
			}
			sort.Slice(entry.Subjects, func(i, j int) bool { return entry.Subjects[i].Subject < entry.Subjects[j].Subject })
			results[i].stream = entry
		}(i, name)
	}
	wg.Wait()
	if truncated.Load() {
		out.Truncated = true
	}

	for _, r := range results {
		if r.err != nil {
			out.Failed++
			if out.Error == "" {
				out.Error = jsUserError(r.err)
			}
			continue
		}
		if r.stream.Name == "" {
			continue
		}
		out.Streams = append(out.Streams, r.stream)
	}
	sort.Slice(out.Streams, func(i, j int) bool { return out.Streams[i].Name < out.Streams[j].Name })
	if out.Failed > 0 && len(out.Streams) > 0 {
		// Partial success is still a catalog. Keep Error for the footer, not as a hard fail.
	}
	if out.Failed == len(names) && len(names) > 0 && out.Error == "" {
		out.Error = "could not read streams"
	}
	return out
}

func collectStreamNames(ctx context.Context, js jetstream.JetStream) ([]string, error) {
	listener := js.ListStreams(ctx)
	var names []string
	for {
		select {
		case info, ok := <-listener.Info():
			if err := listener.Err(); err != nil {
				if errors.Is(err, jetstream.ErrEndOfData) {
					sort.Strings(names)
					return names, nil
				}
				return nil, err
			}
			if !ok {
				sort.Strings(names)
				return names, nil
			}
			if info != nil {
				names = append(names, info.Config.Name)
			}
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}

func sampleCore(ctx context.Context, conn *nats.Conn, filter string, listen time.Duration, discardSys bool) *CoreSnapshot {
	out := &CoreSnapshot{
		Enabled:  true,
		Filter:   filter,
		ListenMs: int(listen / time.Millisecond),
		Subjects: []CoreSubject{},
	}
	ch := make(chan *nats.Msg, coreSubscribeBuffer)
	var dropped atomic.Int64
	sub, err := conn.Subscribe(filter, func(msg *nats.Msg) {
		clone := &nats.Msg{
			Subject: msg.Subject,
			Data:    capPayload(msg.Data),
			Header:  cloneHeader(msg.Header),
		}
		select {
		case ch <- clone:
		default:
			dropped.Add(1)
		}
	})
	if err != nil {
		out.Error = err.Error()
		return out
	}
	defer func() { _ = sub.Unsubscribe() }()
	if err := conn.Flush(); err != nil {
		out.Error = err.Error()
		return out
	}

	hits := map[string]*CoreSubject{}
	timer := time.NewTimer(listen)
	defer timer.Stop()

	finish := func() {
		out.Dropped = int(dropped.Load())
		out.Heard = len(hits)
		out.Subjects = make([]CoreSubject, 0, len(hits))
		for _, hit := range hits {
			out.Subjects = append(out.Subjects, *hit)
		}
		sort.Slice(out.Subjects, func(i, j int) bool { return out.Subjects[i].Subject < out.Subjects[j].Subject })
	}

	for {
		select {
		case <-ctx.Done():
			finish()
			return out
		case <-timer.C:
			finish()
			return out
		case msg := <-ch:
			if msg == nil {
				continue
			}
			if discardSys && isInternalSubject(msg.Subject) {
				continue
			}
			hit, ok := hits[msg.Subject]
			if !ok {
				if len(hits) >= maxCoreSubjects {
					out.Truncated = true
					dropped.Add(1)
					continue
				}
				hit = &CoreSubject{Subject: msg.Subject}
				hits[msg.Subject] = hit
			}
			hit.Count++
			hit.LastPayload = msg.Data
			hit.LastAt = time.Now().UTC()
			if len(msg.Header) > 0 {
				hit.Headers = msg.Header
			}
		}
	}
}

func isInternalSubject(subject string) bool {
	return strings.HasPrefix(subject, "$SYS") ||
		strings.HasPrefix(subject, "$JS.") ||
		strings.HasPrefix(subject, "_INBOX")
}

func jsUserError(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return "timed out"
	}
	s := strings.ToLower(err.Error())
	if strings.Contains(s, "not enabled") || strings.Contains(s, "no jetstream") || strings.Contains(s, "503") {
		return "not enabled on this server"
	}
	return err.Error()
}

func capPayload(data []byte) []byte {
	if len(data) == 0 {
		return nil
	}
	if len(data) > maxPayloadBytes {
		data = data[:maxPayloadBytes]
	}
	out := make([]byte, len(data))
	copy(out, data)
	return out
}

func cloneHeader(h nats.Header) nats.Header {
	if len(h) == 0 {
		return nil
	}
	return nats.Header(http.Header(h).Clone())
}

func queryBoolDefault(c *fiber.Ctx, key string, def bool) bool {
	v := c.Query(key)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}

func queryIntDefault(c *fiber.Ctx, key string, def int) int {
	v := c.Query(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}
