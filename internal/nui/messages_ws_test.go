package nui

import (
	"context"
	"io"
	"log/slog"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	clientws "github.com/fasthttp/websocket"
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/nats-nui/nui/internal/connection"
	"github.com/nats-nui/nui/internal/ws"
	"github.com/stretchr/testify/require"
)

type wsTestRepo struct{ connection.ConnRepo }

func (wsTestRepo) GetById(id string) (*connection.Connection, error) {
	return &connection.Connection{Id: id}, nil
}

type wsTestHub struct {
	registered chan chan<- ws.Payload
}

func (h wsTestHub) Register(_ context.Context, _, _ string, _ <-chan *ws.Request, messages chan<- ws.Payload) error {
	h.registered <- messages
	return nil
}

type wsTestSocket struct {
	net.Conn
	holdRead atomic.Bool
	reading  chan struct{}
	release  chan struct{}
	closed   chan struct{}
	once     sync.Once
}

func (c *wsTestSocket) Read(p []byte) (int, error) {
	if c.holdRead.Swap(false) {
		close(c.reading)
		<-c.release
	}
	return c.Conn.Read(p)
}

func (c *wsTestSocket) Close() error {
	err := c.Conn.Close()
	c.once.Do(func() { close(c.closed) })
	return err
}

type wsTestListener struct {
	net.Listener
	accepted chan *wsTestSocket
}

func (l wsTestListener) Accept() (net.Conn, error) {
	c, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	socket := &wsTestSocket{Conn: c, reading: make(chan struct{}), release: make(chan struct{}), closed: make(chan struct{})}
	l.accepted <- socket
	return socket, nil
}

type wsTestPayload struct {
	encoding chan struct{}
	release  chan struct{}
}

func (*wsTestPayload) GetType() string { return "test" }

func (p *wsTestPayload) MarshalJSON() ([]byte, error) {
	close(p.encoding)
	<-p.release
	return []byte(`{}`), nil
}

func TestHandleWsSub_Shutdown(t *testing.T) {
	for _, name := range []string{"idle", "reading", "encoding", "invalid JSON"} {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			hub := wsTestHub{registered: make(chan chan<- ws.Payload, 1)}
			app := &App{App: fiber.New(fiber.Config{DisableStartupMessage: true}), ctx: ctx,
				nui: &Nui{ConnRepo: wsTestRepo{}, Hub: hub}, l: slog.New(slog.NewTextHandler(io.Discard, nil))}
			returned := make(chan struct{})
			app.Get("/ws", websocket.New(func(c *websocket.Conn) {
				app.HandleWsSub(c)
				close(returned)
			}))
			listener, err := net.Listen("tcp", "127.0.0.1:0")
			require.NoError(t, err)
			accepted := make(chan *wsTestSocket, 1)
			serving := make(chan error, 1)
			go func() { serving <- app.Listener(wsTestListener{listener, accepted}) }()
			t.Cleanup(func() {
				cancel()
				require.NoError(t, app.ShutdownWithTimeout(time.Second))
				select {
				case err := <-serving:
					require.NoError(t, err)
				case <-time.After(time.Second):
					t.Fatal("listener did not stop")
				}
			})
			client, _, err := clientws.DefaultDialer.Dial("ws://"+listener.Addr().String()+"/ws?id=test", nil)
			require.NoError(t, err)
			defer client.Close()
			var socket *wsTestSocket
			select {
			case socket = <-accepted:
			case <-time.After(time.Second):
				t.Fatal("socket was not accepted")
			}
			var messages chan<- ws.Payload
			select {
			case messages = <-hub.registered:
			case <-time.After(time.Second):
				t.Fatal("client was not registered")
			}
			await := func(signal <-chan struct{}) {
				t.Helper()
				select {
				case <-signal:
				case <-time.After(3 * time.Second):
					t.Fatal("websocket shutdown timed out")
				}
			}
			var release chan struct{}
			defer func() {
				if release != nil {
					close(release)
				}
			}()
			switch name {
			case "reading":
				release = socket.release
				socket.holdRead.Store(true)
				require.NoError(t, client.WriteJSON(&ws.Request{}))
				await(socket.reading)
			case "encoding":
				payload := &wsTestPayload{encoding: make(chan struct{}), release: make(chan struct{})}
				release = payload.release
				messages <- payload
				await(payload.encoding)
			case "invalid JSON":
				require.NoError(t, client.WriteMessage(websocket.TextMessage, []byte(`{invalid`)))
				require.NoError(t, client.SetReadDeadline(time.Now().Add(time.Second)))
				_, _, err := client.ReadMessage()
				require.True(t, websocket.IsCloseError(err, 4422), "unexpected close: %v", err)
			}
			cancel()
			await(socket.closed)
			if release != nil {
				select {
				case <-returned:
					t.Fatal("handler returned before its worker finished")
				default:
				}
				close(release)
				release = nil
			}
			await(returned)
		})
	}
}
