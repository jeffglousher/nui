package nui

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/nats-io/nats.go"
	"github.com/nats-nui/nui/internal/connection"
)

func (a *App) HandleCoreListen(c *fiber.Ctx) error {
	if c.Params("id") == "" {
		return c.Status(422).JSON("id is required")
	}
	id := strings.Clone(c.Params("id"))
	discardSys := c.QueryBool("discard_sys", true)
	filter := strings.Clone(normalizeListenFilter(c.Query("filter")))

	if err := validateListenFilter(filter); err != nil {
		return c.Status(422).JSON(NewError(err.Error()))
	}
	listenMs := c.QueryInt("listen_ms", defaultListenMs)
	if listenMs < minListenMs {
		listenMs = minListenMs
	}
	if listenMs > maxListenMs {
		listenMs = maxListenMs
	}

	budget := time.Duration(listenMs)*time.Millisecond + 2*time.Second
	ctx, cancel := context.WithTimeout(c.Context(), budget)
	defer cancel()
	ctx, release := a.coreListens.takeover(id, ctx)
	defer release()
	if err := ctx.Err(); err != nil {
		return c.JSON(&CoreCatalog{Filter: filter, ListenMs: listenMs, Subjects: []CoreSubject{}, Error: subjectDiscoveryError(err)})
	}

	cfg, err := a.nui.ConnRepo.GetById(id)
	if err != nil {
		return c.Status(404).JSON(NewError("connection could not be read"))
	}
	nc, err := connection.DialOnce(ctx, cfg)
	if err != nil {
		return c.Status(422).JSON(NewError(subjectDiscoveryError(err)))
	}
	defer nc.Close()

	out := sampleCoreLimited(ctx, nc, filter, time.Duration(listenMs)*time.Millisecond, maxCoreSubjects, discardSys)
	return c.JSON(out)
}

func sampleCoreLimited(ctx context.Context, conn *nats.Conn, filter string, listen time.Duration, nameCap int, discardSys bool) *CoreCatalog {
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
	conn.SetClosedHandler(func(_ *nats.Conn) {
		select {
		case asyncErr <- nats.ErrConnectionClosed:
		default:
		}
	})

	ch := make(chan string, coreSubscribeBuffer)
	sub, err := conn.Subscribe(filter, func(msg *nats.Msg) {
		if hideInternal(discardSys, msg.Subject) {
			return
		}
		select {
		case ch <- msg.Subject:
		default:
			select {
			case asyncErr <- nats.ErrSlowConsumer:
			default:
			}
		}
	})
	if err != nil {
		out.Error = subjectDiscoveryError(err)
		return out
	}
	if err := sub.SetPendingLimits(corePendingMsgs, corePendingBytes); err != nil {
		_ = sub.Unsubscribe()
		out.Error = subjectDiscoveryError(err)
		return out
	}

	defer sub.Unsubscribe()

	flushCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := conn.FlushWithContext(flushCtx); err != nil {
		out.Error = subjectDiscoveryError(err)
		return out
	}
	if err := conn.LastError(); err != nil {
		out.Error = subjectDiscoveryError(err)
		return out
	}

	hits := map[string]int{}
	extraDropped := 0
	timer := time.NewTimer(listen)
	defer timer.Stop()

	defer func() {
		pendingDropped, err := sub.Dropped()
		dropped := extraDropped
		if err == nil && pendingDropped > 0 {
			dropped += pendingDropped
		}
		out.Dropped = dropped
		out.Heard = len(hits)
		out.Subjects = make([]CoreSubject, 0, len(hits))
		for subject, count := range hits {
			out.Subjects = append(out.Subjects, CoreSubject{Subject: subject, Count: count})
		}
		sort.Slice(out.Subjects, func(i, j int) bool { return out.Subjects[i].Subject < out.Subjects[j].Subject })
	}()

	for {
		select {
		case err := <-asyncErr:
			out.Error = subjectDiscoveryError(err)
			return out
		case <-ctx.Done():
			if ctx.Err() == context.DeadlineExceeded {
				out.Error = "timed out"
			}
			return out
		case <-timer.C:
			return out
		case subject := <-ch:
			count, exists := hits[subject]
			if !exists && nameCap > 0 && len(hits) >= nameCap {
				out.Truncated = true
				extraDropped++
				return out
			}
			hits[subject] = count + 1
		}
	}
}
