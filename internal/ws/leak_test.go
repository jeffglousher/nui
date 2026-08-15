package ws

import (
	"runtime"
	"testing"
	"time"

	"github.com/nats-nui/nui/pkg/logging"
	"github.com/stretchr/testify/require"
)

// TestHub_NoGoroutineLeakOnSubscriptionChurn confirms that repeatedly
// (re)subscribing and then purging does not leak goroutines.
//
// Each registerSubscriptions spawns parseToClientMessage(FanIn(...)). The relay
// goroutine only returns when its input channel (the FanIn output) is closed.
// When subscriptions are purged, UnsubscribeAll closes the per-subject input
// channels, so the FanIn workers exit — but if the FanIn output is never
// closed, parseToClientMessage blocks on <-natsMsg forever, leaking one
// goroutine per subscription registration (every subject change, and every
// disconnect) for the life of the process.
func TestHub_NoGoroutineLeakOnSubscriptionChurn(t *testing.T) {
	pool := &mockPool{Conn: &mockConnection{LastEventData: Disconnected}}
	hub := NewHub[*mockSubscription, *mockConnection](pool, &mockMetricsService{}, &logging.NullLogger{})

	clientId := "leak-client"
	req := make(chan *Request)
	msgs := make(chan Payload, 1000)
	// Drain client messages so relays never block on send.
	go func() {
		for range msgs {
		}
	}()

	hub.reg[clientId] = NewWClientConn[*mockSubscription]("connection", req, msgs)

	runtime.GC()
	time.Sleep(50 * time.Millisecond)
	base := runtime.NumGoroutine()

	const cycles = 50
	for i := 0; i < cycles; i++ {
		require.NoError(t, hub.registerSubscriptions(clientId, &SubsReq{Subjects: []string{"a.>", "b.>", "c.>"}}))
		hub.purgeSubscriptions(clientId)
	}
	hub.purgeConnection(clientId)

	afterChurn := runtime.NumGoroutine()
	t.Logf("goroutines: baseline=%d immediately-after-churn=%d (cycles=%d, 3 subjects each)", base, afterChurn, cycles)

	require.Eventually(t, func() bool {
		runtime.GC()
		return runtime.NumGoroutine() <= base+5
	}, 3*time.Second, 25*time.Millisecond)

	t.Logf("goroutines settled to %d (baseline=%d) — no leak", runtime.NumGoroutine(), base)
}
