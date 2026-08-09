package logging

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestRotatingWriter_BoundsFileSize confirms that writing far more than the cap
// keeps the active log file bounded (rotation into a single backup), so a
// long-running process cannot grow the log without limit.
func TestRotatingWriter_BoundsFileSize(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "logs.log")

	const maxBytes int64 = 1024 // 1 KiB cap for the test
	w, err := newRotatingWriter(path, maxBytes)
	require.NoError(t, err)

	line := []byte(strings.Repeat("x", 100) + "\n") // 101 bytes/line
	// Write ~100 KiB total, i.e. ~100x the cap.
	for i := 0; i < 1000; i++ {
		_, err := w.Write(line)
		require.NoError(t, err)
	}

	info, err := os.Stat(path)
	require.NoError(t, err)
	// Active file stays within one line of the cap.
	require.LessOrEqualf(t, info.Size(), maxBytes+int64(len(line)),
		"active log file grew unbounded: size=%d cap=%d", info.Size(), maxBytes)

	// Total on-disk (active + single backup) stays ~2x the cap, not 100x.
	total := info.Size()
	if b, err := os.Stat(path + ".1"); err == nil {
		total += b.Size()
	}
	require.LessOrEqualf(t, total, 2*maxBytes+int64(len(line)),
		"total log footprint grew unbounded: total=%d cap=%d", total, maxBytes)
}

// TestRotatingWriter_PreservesRecentLines confirms rotation keeps recent log
// content (in the active file or the retained backup) rather than dropping it.
func TestRotatingWriter_PreservesRecentLines(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "logs.log")

	w, err := newRotatingWriter(path, 512)
	require.NoError(t, err)

	for i := 0; i < 200; i++ {
		_, err := w.Write([]byte(strings.Repeat("y", 60) + "\n"))
		require.NoError(t, err)
	}
	last := []byte("LAST-LINE-MARKER\n")
	_, err = w.Write(last)
	require.NoError(t, err)

	active, _ := os.ReadFile(path)
	backup, _ := os.ReadFile(path + ".1")
	require.Truef(t, strings.Contains(string(active), "LAST-LINE-MARKER") || strings.Contains(string(backup), "LAST-LINE-MARKER"),
		"most recent line was lost after rotation")
}
