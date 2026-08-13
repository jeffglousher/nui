package nui

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/nats-io/nats.go"
	"github.com/nats-nui/nui/internal/connection"
)

// HandleCoreListen samples Core NATS on a dedicated short-lived connection.
// It never uses the pooled connection. An empty filter means ">" — that is
// how discovery looks around. A short window and name cap keep it bounded.
// Payloads are not returned.
func (a *App) HandleCoreListen(c *fiber.Ctx) error {
	if c.Params("id") == "" {
		return c.Status(422).JSON("id is required")
	}
	filter := normalizeListenFilter(c.Query("filter"))
	if err := validateListenFilter(filter); err != nil {
		return c.Status(422).JSON(NewError(err.Error()))
	}
	listenMs := queryIntDefault(c, "listen_ms", defaultListenMs)
	if listenMs < minListenMs {
		listenMs = minListenMs
	}
	if listenMs > maxListenMs {
		listenMs = maxListenMs
	}
	discardSys := queryBoolDefault(c, "discard_sys", true)

	cfg, err := a.nui.ConnRepo.GetById(c.Params("id"))
	if err != nil {
		return a.logAndFiberError(c, err, 404)
	}
	nc, err := connection.DialOnce(cfg)
	if err != nil {
		return a.logAndFiberError(c, err, 422)
	}
	defer nc.Close()

	budget := time.Duration(listenMs)*time.Millisecond + 2*time.Second
	ctx, cancel := context.WithTimeout(c.Context(), budget)
	defer cancel()

	out := sampleCore(ctx, nc, filter, time.Duration(listenMs)*time.Millisecond, discardSys)
	return c.JSON(out)
}

func sampleCore(ctx context.Context, conn *nats.Conn, filter string, listen time.Duration, discardSys bool) *CoreCatalog {
	out := &CoreCatalog{
		Filter:   filter,
		ListenMs: int(listen / time.Millisecond),
		Subjects: []CoreSubject{},
	}
	asyncErr := make(chan error, 1)
	conn.SetErrorHandler(func(_ *nats.Conn, _ *nats.Subscription, err error) {
		if err == nil {
			return
		}
		select {
		case asyncErr <- err:
		default:
		}
	})

	ch := make(chan *nats.Msg, coreSubscribeBuffer)
	sub, err := conn.ChanSubscribe(filter, ch)
	if err != nil {
		out.Error = coreUserError(err)
		return out
	}
	_ = sub.SetPendingLimits(corePendingMsgs, corePendingBytes)

	var unsubOnce sync.Once
	unsubscribe := func() {
		unsubOnce.Do(func() { _ = sub.Unsubscribe() })
	}
	defer unsubscribe()

	stop := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			unsubscribe()
		case <-stop:
		}
	}()
	defer close(stop)

	if err := conn.Flush(); err != nil {
		out.Error = coreUserError(err)
		return out
	}
	if err := conn.LastError(); err != nil {
		out.Error = coreUserError(err)
		return out
	}

	hits := map[string]*CoreSubject{}
	var extraDropped atomic.Int64
	timer := time.NewTimer(listen)
	defer timer.Stop()

	finish := func() {
		pendingDropped, err := sub.Dropped()
		unsubscribe()
		dropped := int(extraDropped.Load())
		if err == nil && pendingDropped > 0 {
			dropped += pendingDropped
		}
		out.Dropped = dropped
		out.Heard = len(hits)
		out.Subjects = make([]CoreSubject, 0, len(hits))
		for _, hit := range hits {
			out.Subjects = append(out.Subjects, *hit)
		}
		sortCoreSubjects(out.Subjects)
	}

	record := func(msg *nats.Msg) {
		if msg == nil {
			return
		}
		if discardSys && isInternalSubject(msg.Subject) {
			return
		}
		hit, exists := hits[msg.Subject]
		if !exists {
			if len(hits) >= maxCoreSubjects {
				out.Truncated = true
				extraDropped.Add(1)
				return
			}
			hit = &CoreSubject{Subject: msg.Subject}
			hits[msg.Subject] = hit
		}
		hit.Count++
	}

	for {
		select {
		case err := <-asyncErr:
			out.Error = coreUserError(err)
			finish()
			return out
		case <-ctx.Done():
			if out.Error == "" && errors.Is(ctx.Err(), context.DeadlineExceeded) {
				out.Error = "timed out"
			}
			finish()
			return out
		case <-timer.C:
			finish()
			return out
		case msg, ok := <-ch:
			if !ok {
				finish()
				return out
			}
			record(msg)
		}
	}
}

func coreUserError(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return "timed out"
	}
	s := strings.ToLower(err.Error())
	if strings.Contains(s, "permission") || strings.Contains(s, "authorization") || strings.Contains(s, "not permitted") {
		return "not allowed"
	}
	return err.Error()
}
