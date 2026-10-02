package connection

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/stretchr/testify/require"
)

func TestNatsConn_ObserveConnectionEvents(t *testing.T) {
	nconn, err := newMocked()
	require.NoError(t, err)
	t.Cleanup(nconn.Close)
	status, err := nconn.LastEvent()
	require.Equal(t, StatusDisconnected, status)
	require.NoError(t, err)

	ch1 := nconn.ObserveConnectionEvents(context.Background())
	ctx2, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch2 := nconn.ObserveConnectionEvents(ctx2)

	nconn.DisconnectErrHandler()(nconn.Conn, nil)
	nconn.ReconnectHandler()(nconn.Conn)
	for _, ch := range []<-chan ConnStatusChanged{ch1, ch2} {
		require.Len(t, ch, 2)
		require.Equal(t, StatusDisconnected, (<-ch).Status)
		require.Equal(t, StatusConnected, (<-ch).Status)
	}
	assertClosed := func(ch <-chan ConnStatusChanged) {
		t.Helper()
		select {
		case _, ok := <-ch:
			require.False(t, ok, "event channel must be closed")
		case <-time.After(time.Second):
			t.Fatal("event channel did not close")
		}
	}

	cancel()
	assertClosed(ch2)
	nconn.ReconnectHandler()(nconn.Conn)
	nconn.ClosedHandler()(nconn.Conn)
	require.Len(t, ch1, 2)
	require.Equal(t, StatusConnected, (<-ch1).Status)
	require.Equal(t, StatusDisconnected, (<-ch1).Status)
	nconn.Close()
	assertClosed(ch1)
	assertClosed(nconn.ObserveConnectionEvents(context.Background()))
	nconn.ReconnectHandler()(nconn.Conn)
	nconn.Close()
}

func TestNatsConn_StatusHandlerUsesCallbackConnection(t *testing.T) {
	nconn := &NatsConn{}
	nconn.buildStatusHandler(StatusConnected)(&nats.Conn{})
	status, err := nconn.LastEvent()
	require.Equal(t, StatusConnected, status)
	require.NoError(t, err)
}

func TestNatsConn_ConcurrentConnectionEvents(t *testing.T) {
	nconn, err := newMocked()
	require.NoError(t, err)
	t.Cleanup(nconn.Close)
	start := make(chan struct{})
	var workers sync.WaitGroup
	workers.Add(3)
	go func() {
		defer workers.Done()
		<-start
		for i := 0; i < 2000; i++ {
			nconn.DisconnectErrHandler()(nconn.Conn, nil)
			nconn.ReconnectHandler()(nconn.Conn)
		}
	}()
	go func() {
		defer workers.Done()
		<-start
		deadline := time.After(time.Second)
		for i := 0; i < 100; i++ {
			ctx, cancel := context.WithCancel(context.Background())
			events := nconn.ObserveConnectionEvents(ctx)
			cancel()
			if i == 50 {
				nconn.Close()
			}
		closed:
			for {
				select {
				case _, ok := <-events:
					if !ok {
						break closed
					}
				case <-deadline:
					t.Error("canceled event channel did not close")
					return
				}
			}
		}
	}()
	go func() {
		defer workers.Done()
		<-start
		for i := 0; i < 4000; i++ {
			nconn.LastEvent()
		}
	}()
	close(start)
	workers.Wait()
}
