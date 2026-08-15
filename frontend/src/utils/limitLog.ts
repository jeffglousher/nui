/** last fire time per key; used so a flood cannot fill the in-app log */
const lastAt = new Map<string, number>()

/**
 * True the first time `key` is seen, then at most once per `intervalMs`.
 * Interval 0 always logs.
 */
export function limitLogDue(key: string, intervalMs: number, now = Date.now()): boolean {
	const prev = lastAt.get(key) ?? 0
	if (intervalMs > 0 && now - prev < intervalMs) return false
	lastAt.set(key, now)
	return true
}

export function resetLimitLog(): void {
	lastAt.clear()
}
