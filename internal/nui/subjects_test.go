package nui

import (
	"context"
	"errors"
	"testing"

	"github.com/nats-io/nats.go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsInternalSubject(t *testing.T) {
	assert.True(t, isInternalSubject("$SYS.SERVER.INFO"))
	assert.True(t, isInternalSubject("$JS.API.INFO"))
	assert.True(t, isInternalSubject("_INBOX.abc"))
	assert.False(t, isInternalSubject("orders.created"))
	assert.False(t, isInternalSubject("inbox.user"))
	assert.False(t, isInternalSubject("$KV.mybucket.key"))
	assert.False(t, isInternalSubject("$O.files.chunk"))
}

func TestCapPayloadCopiesAndTruncates(t *testing.T) {
	src := []byte("hello")
	got := capPayload(src)
	src[0] = 'x'
	assert.Equal(t, []byte("hello"), got)

	big := make([]byte, maxPayloadBytes+50)
	for i := range big {
		big[i] = 'a'
	}
	got = capPayload(big)
	assert.Len(t, got, maxPayloadBytes)
	assert.Nil(t, capPayload(nil))
}

func TestCloneHeaderIsIndependent(t *testing.T) {
	h := nats.Header{"A": []string{"1"}}
	got := cloneHeader(h)
	h["A"][0] = "changed"
	h["B"] = []string{"2"}
	assert.Equal(t, []string{"1"}, got["A"])
	assert.Empty(t, got["B"])
	assert.Nil(t, cloneHeader(nil))
}

func TestJsUserError(t *testing.T) {
	assert.Equal(t, "", jsUserError(nil))
	assert.Equal(t, "timed out", jsUserError(context.DeadlineExceeded))
	assert.Equal(t, "not enabled on this server", jsUserError(errors.New("nats: JetStream not enabled")))
	assert.Equal(t, "not enabled on this server", jsUserError(errors.New("503 no responders")))
	assert.Equal(t, "boom", jsUserError(errors.New("boom")))
}

func TestQueryHelpersStayOnThePage(t *testing.T) {
	require.Equal(t, maxCoreSubjects, 5000)
	require.Equal(t, maxJSStreams, 500)
}
