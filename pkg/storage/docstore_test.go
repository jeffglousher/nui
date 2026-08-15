package docstore

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/ostafen/clover/v2/document"
	"github.com/stretchr/testify/require"
)

func TestDocStore_InMemoryOpens(t *testing.T) {
	db, err := NewDocStore(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	doc := document.NewDocument()
	doc.Set("name", "mem")
	id, err := db.InsertOne(CONN_COLLECTION, doc)
	require.NoError(t, err)
	got, err := db.FindById(CONN_COLLECTION, id)
	require.NoError(t, err)
	require.Equal(t, "mem", got.Get("name"))
}

func TestDocStore_OnDiskFootprintStaysSmallWhileOpen(t *testing.T) {
	dir := t.TempDir()
	db, err := NewDocStore(dir)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	doc := document.NewDocument()
	doc.Set("name", "local-flood")
	doc.Set("hosts", []string{"127.0.0.1:4222"})
	_, err = db.InsertOne(CONN_COLLECTION, doc)
	require.NoError(t, err)

	max := maxApparentFile(t, dir)
	require.Less(t, max, int64(oversizedVlogBytes),
		"open db must not mmap a DefaultOptions-sized value log")
}

func TestDocStore_ReclaimsLeftoverValueLog(t *testing.T) {
	dir := t.TempDir()
	db, err := NewDocStore(dir)
	require.NoError(t, err)
	doc := document.NewDocument()
	doc.Set("name", "keep-me")
	id, err := db.InsertOne(CONN_COLLECTION, doc)
	require.NoError(t, err)
	require.NoError(t, db.Close())

	vlogs, err := filepath.Glob(filepath.Join(dir, "*.vlog"))
	require.NoError(t, err)
	require.NotEmpty(t, vlogs)
	require.NoError(t, os.Truncate(vlogs[0], 40<<20))

	oversized, err := hasOversizedValueLog(dir)
	require.NoError(t, err)
	require.True(t, oversized)

	db, err = NewDocStore(dir)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	got, err := db.FindById(CONN_COLLECTION, id)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "keep-me", got.Get("name"))
	require.Less(t, maxApparentFile(t, dir), int64(oversizedVlogBytes))
}

func maxApparentFile(t *testing.T, dir string) int64 {
	t.Helper()
	var max int64
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		if info.Size() > max {
			max = info.Size()
		}
		return nil
	})
	require.NoError(t, err)
	return max
}
