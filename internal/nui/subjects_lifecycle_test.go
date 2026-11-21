package nui

import (
	"context"
	"encoding/json"
	"strconv"
	"testing"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/stretchr/testify/require"
)

func TestJetStreamCatalogReportsStreamCap(t *testing.T) {
	ns := startTestNATS(t, nil)
	nc, err := nats.Connect(ns.ClientURL())
	require.NoError(t, err)
	defer nc.Close()
	infos := make([]*jetstream.StreamInfo, maxJSStreams+1)
	for i := range infos {
		infos[i] = &jetstream.StreamInfo{Config: jetstream.StreamConfig{Name: "S" + strconv.Itoa(i), Subjects: []string{"s" + strconv.Itoa(i)}}}
	}
	response, err := json.Marshal(map[string]any{"total": len(infos), "limit": len(infos), "offset": 0, "streams": infos})
	require.NoError(t, err)
	_, err = nc.Subscribe("$JS.API.STREAM.LIST", func(m *nats.Msg) { _ = m.Respond(response) })
	require.NoError(t, err)
	require.NoError(t, nc.Flush())
	js, err := jetstream.New(nc)
	require.NoError(t, err)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	cat := enumerateJetStreamPatterns(ctx, js, true)
	require.Empty(t, cat.Error)
	require.True(t, cat.Truncated)
	require.Len(t, cat.Streams, maxJSStreams)
}

func TestOccupiedDoesNotWalkEveryPage(t *testing.T) {
	ns := startTestNATS(t, nil)
	nc, err := nats.Connect(ns.ClientURL())
	require.NoError(t, err)
	defer nc.Close()
	_, err = nc.Subscribe("$JS.API.STREAM.INFO.MANY", func(m *nats.Msg) {
		var request struct {
			Offset int `json:"offset"`
		}
		_ = json.Unmarshal(m.Data, &request)
		if request.Offset != 0 {
			return
		}
		_ = m.Respond([]byte(`{"total":100001,"limit":100000,"config":{"name":"MANY","subjects":["orders.>"]},"state":{"subjects":{"orders.created":1}}}`))
	})
	require.NoError(t, err)
	require.NoError(t, nc.Flush())
	js, err := jetstream.New(nc)
	require.NoError(t, err)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	cat := occupiedSubjects(ctx, js, "MANY", "orders.>", true)
	require.Empty(t, cat.Error)
	require.True(t, cat.Truncated)
	require.Len(t, cat.Subjects, 1)
}
