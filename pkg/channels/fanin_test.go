package channels

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestFanIn_ClosesWhenInputsDrain(t *testing.T) {
	a := make(chan int)
	b := make(chan int)
	out := FanIn(2, a, b)

	go func() {
		a <- 1
		close(a)
	}()
	go func() {
		b <- 2
		close(b)
	}()

	got := map[int]bool{}
	timeout := time.After(time.Second)
	for {
		select {
		case n, ok := <-out:
			if !ok {
				require.True(t, got[1])
				require.True(t, got[2])
				return
			}
			got[n] = true
		case <-timeout:
			t.Fatal("FanIn output was never closed")
		}
	}
}
