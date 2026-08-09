package logging

import (
	"os"
	"sync"
)

// defaultMaxLogBytes bounds a single log file before it is rotated. With one
// retained backup this caps on-disk log usage at roughly 2x this value, so a
// long-running instance cannot fill the disk with logs.
const defaultMaxLogBytes int64 = 50 << 20 // 50 MiB

// rotatingWriter is a minimal, dependency-free, size-bounded io.Writer. When the
// active file would exceed maxBytes it is renamed to "<path>.1" (replacing any
// previous backup) and a fresh file is started. Writes are serialized so it is
// safe for concurrent logging, and each Write is kept whole (never split across
// a rotation) so log lines stay intact.
type rotatingWriter struct {
	mu       sync.Mutex
	path     string
	maxBytes int64
	size     int64
	f        *os.File
}

func newRotatingWriter(path string, maxBytes int64) (*rotatingWriter, error) {
	if maxBytes <= 0 {
		maxBytes = defaultMaxLogBytes
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	return &rotatingWriter{path: path, maxBytes: maxBytes, size: info.Size(), f: f}, nil
}

func (w *rotatingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Rotate before writing so a full line lands in the fresh file. A single
	// write larger than maxBytes is still written (after one rotation) to avoid
	// looping; it may briefly exceed the cap.
	if w.size > 0 && w.size+int64(len(p)) > w.maxBytes {
		if err := w.rotate(); err != nil {
			return 0, err
		}
	}

	n, err := w.f.Write(p)
	w.size += int64(n)
	return n, err
}

func (w *rotatingWriter) rotate() error {
	if err := w.f.Close(); err != nil {
		return err
	}
	// Replace the previous backup with the current file.
	if err := os.Rename(w.path, w.path+".1"); err != nil {
		// If rotation fails, keep appending to the existing file rather than
		// losing logs entirely.
		f, openErr := os.OpenFile(w.path, os.O_APPEND|os.O_CREATE|os.O_RDWR, 0644)
		if openErr != nil {
			return openErr
		}
		w.f = f
		return nil
	}
	f, err := os.OpenFile(w.path, os.O_APPEND|os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return err
	}
	w.f = f
	w.size = 0
	return nil
}
