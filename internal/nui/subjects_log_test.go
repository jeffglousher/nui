package nui

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
)

type memLogger struct {
	mu   sync.Mutex
	warn []string
}

func (m *memLogger) Debug(string, ...any) {}
func (m *memLogger) Info(string, ...any)  {}
func (m *memLogger) Error(string, ...any) {}
func (m *memLogger) Warn(msg string, _ ...any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.warn = append(m.warn, msg)
}

func TestNoteCatalogLimitLogsOnlyWhenHit(t *testing.T) {
	log := &memLogger{}
	noteCatalogLimit(log, "core", "c1", false, 0, 3, 0)
	assert.Empty(t, log.warn)

	noteCatalogLimit(log, "core", "c1", true, 12, 5000, 0)
	assert.Equal(t, []string{"subjects catalog hit a limit"}, log.warn)

	noteCatalogLimit(nil, "core", "c1", true, 1, 1, 0)
}

func TestNoteCatalogErrorSkipsEmpty(t *testing.T) {
	log := &memLogger{}
	noteCatalogError(log, "core", "c1", "")
	assert.Empty(t, log.warn)
	noteCatalogError(log, "core", "c1", "not allowed")
	assert.Equal(t, []string{"subjects catalog failed"}, log.warn)
}

func TestJetStreamLimitHit(t *testing.T) {
	truncated, failed := jetStreamLimitHit(&JetStreamCatalog{Streams: []JetStreamStream{{Name: "A"}}})
	assert.False(t, truncated)
	assert.Zero(t, failed)

	truncated, failed = jetStreamLimitHit(&JetStreamCatalog{
		Failed: 2,
		Streams: []JetStreamStream{
			{Name: "A", Truncated: true},
		},
	})
	assert.True(t, truncated)
	assert.Equal(t, 2, failed)
}
