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

	var got []int
	timeout := time.After(time.Second)
	for {
		select {
		case n, ok := <-out:
			if !ok {
				require.ElementsMatch(t, []int{1, 2}, got)
				return
			}
			got = append(got, n)
		case <-timeout:
			t.Fatal("FanIn output was never closed")
		}
	}
}

func TestFanIn_ClosesWithoutInputs(t *testing.T) {
	select {
	case _, ok := <-FanIn[int](0):
		require.False(t, ok)
	case <-time.After(time.Second):
		t.Fatal("FanIn output was never closed")
	}
}
