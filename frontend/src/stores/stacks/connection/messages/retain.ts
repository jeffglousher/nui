import { Message } from "@/types/Message"

export type MessageStat = {
	subject: string,
	counter: number,
	last: number,
}

export const MaxMessagesLength = 20000

export const MaxMessageStats = 2000

export function appendMessages(current: Message[], batch: Message[], max = MaxMessagesLength): Message[] {
	if (!batch.length) return current
	const next = current.length === 0 ? batch.slice() : current.concat(batch)
	if (next.length <= max) return next
	return next.slice(next.length - max)
}

export function recordStat(
	stats: { [subject: string]: MessageStat },
	subject: string,
	now: number,
	max = MaxMessageStats,
): { [subject: string]: MessageStat } {
	const existing = Object.prototype.hasOwnProperty.call(stats, subject) ? stats[subject] : undefined
	if (existing) {
		existing.counter++
		existing.last = now
		return stats
	}
	const next = { ...stats, [subject]: { subject, counter: 1, last: now } }
	const keys = Object.keys(next)
	if (keys.length <= max) return next
	let oldestKey = keys[0]
	let oldestLast = next[oldestKey].last
	for (const key of keys) {
		if (next[key].last < oldestLast) {
			oldestKey = key
			oldestLast = next[key].last
		}
	}
	delete next[oldestKey]
	return next
}
