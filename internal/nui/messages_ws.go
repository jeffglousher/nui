package nui

import (
	"context"
	"errors"
	"github.com/gofiber/contrib/websocket"
	"github.com/google/uuid"
	"github.com/nats-nui/nui/internal/ws"
	"net"
	"sync"
	"time"
)

func (a *App) HandleWsSub(c *websocket.Conn) {
	connId := c.Query("id")
	if connId == "" {
		writeError(c, 4422, errors.New("id is required"))
		return
	}
	conn, err := a.nui.ConnRepo.GetById(connId)
	if err != nil {
		writeError(c, 4404, err)
		return
	}
	ctx, cancel := context.WithCancel(a.ctx)
	defer cancel()
	clientId := uuid.NewString()
	a.l.Info("incoming ws connection", "connection-id", conn.Id, "client-id", clientId)

	reqCh := make(chan *ws.Request, 1)
	msgCh := make(chan ws.Payload, 1000)

	c.SetCloseHandler(func(code int, text string) error {
		cancel()
		return nil
	})

	err = a.nui.Hub.Register(ctx, clientId, conn.Id, reqCh, msgCh)
	if err != nil {
		writeError(c, 4500, err)
		return
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		HandleWsMsgs(c, ctx, msgCh, cancel)
	}()
	go func() {
		defer wg.Done()
		HandleWsRequest(c, ctx, reqCh, cancel)
	}()
	<-ctx.Done()
	// fasthttp's hijacked wrapper defers Close until this callback returns.
	socket := c.NetConn()
	if raw, ok := socket.(interface{ UnsafeConn() net.Conn }); ok {
		socket = raw.UnsafeConn()
	}
	_ = socket.Close()
	wg.Wait()
}

func HandleWsRequest(c *websocket.Conn, ctx context.Context, reqCh chan *ws.Request, cancel context.CancelFunc) {
	for {
		req := &ws.Request{}
		err := c.ReadJSON(req)
		if err != nil {
			writeError(c, 4422, err)
			cancel()
			return
		}
		select {
		case <-ctx.Done():
			return
		case reqCh <- req:
		default:
		}
	}
}

func HandleWsMsgs(c *websocket.Conn, ctx context.Context, msgCh chan ws.Payload, cancel context.CancelFunc) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-msgCh:
			message := ws.NewWsMessage(msg)
			err := c.WriteJSON(message)
			if err != nil {
				writeError(c, 4422, err)
				cancel()
				return
			}
		}
	}
}

func writeError(c *websocket.Conn, status int, err error) {
	_ = c.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(status, err.Error()), time.Now().Add(time.Second))
}
