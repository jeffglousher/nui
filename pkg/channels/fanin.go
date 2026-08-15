package channels

import "sync"

// FanIn merges several input channels into a single output channel. The output
// is closed once every input channel has been closed and fully drained, so a
// consumer that ranges over (or selects on) the output will terminate instead
// of blocking forever. This lets callers tie a relay goroutine's lifetime to
// the lifetime of its inputs (e.g. closing per-subscription channels on
// unsubscribe/disconnect cleanly stops the relay).
func FanIn[T any](buffer int, ins ...<-chan T) <-chan T {
	out := make(chan T, buffer)
	if len(ins) == 0 {
		close(out)
		return out
	}
	var wg sync.WaitGroup
	wg.Add(len(ins))
	for _, c := range ins {
		go func(c <-chan T) {
			defer wg.Done()
			for n := range c {
				out <- n
			}
		}(c)
	}
	go func() {
		wg.Wait()
		close(out)
	}()
	return out
}
