package docstore

import (
	"os"
	"path/filepath"

	"github.com/dgraph-io/badger/v4"
	c "github.com/ostafen/clover/v2"
	"github.com/ostafen/clover/v2/document"
	badgerstore "github.com/ostafen/clover/v2/store/badger"
)

const CONN_COLLECTION = "connections"

// Badger DefaultOptions is sized for a large KV store. createVlogFile
// truncates each *.vlog to 2*ValueLogFileSize, so the defaults
// (ValueLogFileSize=1GiB-1) produce a ~2GiB file the moment the DB
// opens — nats-nui/nui#125. NUI only stores a handful of connection
// documents, so we shrink the mmap, memtables, and block cache.
const (
	valueLogFileSize   = 8 << 20 // 8MiB → 16MiB on-disk mmap
	memTableSize       = 2 << 20
	blockCacheSize     = 8 << 20
	oversizedVlogBytes = 32 << 20
)

type DB struct {
	*c.DB
}

func NewDocStore(path string) (*DB, error) {
	if path == "" || path == ":memory:" {
		// Dir/ValueDir must be empty in InMemory mode. Passing ":memory:"
		// as the path (the old DefaultOptions habit) makes Badger refuse
		// to open: "Cannot use badger in Disk-less mode with Dir set".
		return openClover(nuiBadgerOptions("").WithInMemory(true))
	}
	opts := nuiBadgerOptions(path)
	if err := reclaimOversizedValueLogs(path, opts); err != nil {
		return nil, err
	}
	return openClover(opts)
}

func nuiBadgerOptions(path string) badger.Options {
	return badger.DefaultOptions(path).
		WithValueLogFileSize(valueLogFileSize).
		WithMemTableSize(memTableSize).
		WithNumMemtables(2).
		WithNumLevelZeroTables(2).
		WithNumLevelZeroTablesStall(4).
		WithNumCompactors(2).
		WithBlockCacheSize(blockCacheSize).
		WithIndexCacheSize(0).
		WithValueThreshold(1 << 10).
		WithNumVersionsToKeep(1).
		WithDetectConflicts(false).
		WithCompactL0OnClose(true).
		WithMetricsEnabled(false).
		WithLoggingLevel(badger.WARNING).
		WithNumGoroutines(2)
}

func openClover(opts badger.Options) (*DB, error) {
	store, err := badgerstore.OpenWithOptions(opts)
	if err != nil {
		return nil, err
	}
	db, err := c.OpenWithStore(store)
	if err != nil {
		_ = store.Close()
		return nil, err
	}
	if err = createCollection(db, CONN_COLLECTION); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &DB{DB: db}, nil
}

// reclaimOversizedValueLogs opens and closes a leftover DefaultOptions
// value log (typical after a crash) so Badger can truncate it to the
// bytes it actually wrote. A clean shutdown already does this; a
// running process with the old defaults is what `ls` reports as 2GiB.
func reclaimOversizedValueLogs(path string, opts badger.Options) error {
	oversized, err := hasOversizedValueLog(path)
	if err != nil || !oversized {
		return err
	}
	db, err := badger.Open(opts)
	if err != nil {
		return err
	}
	return db.Close()
}

func hasOversizedValueLog(path string) (bool, error) {
	matches, err := filepath.Glob(filepath.Join(path, "*.vlog"))
	if err != nil {
		return false, err
	}
	for _, name := range matches {
		info, err := os.Stat(name)
		if err != nil {
			return false, err
		}
		if info.Size() > oversizedVlogBytes {
			return true, nil
		}
	}
	return false, nil
}

func (d *DB) DocFromType(obj any) *document.Document {
	return document.NewDocumentOf(obj)
}

func createCollection(db *c.DB, name string) error {
	ok, err := db.HasCollection(name)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	return db.CreateCollection(name)
}
