import { Message } from "@/types/Message"

export type MessageStat = {
	subject: string,
	counter: number,
	last: number,
}

/** live MESSAGES tail kept in memory — always on */
export const MaxMessagesLength = 8000

/** distinct subjects tracked in the per-card stats map — always on */
export const MaxMessageStats = 2000

export type AppendMessagesResult = {
	messages: Message[]
	dropped: number
}

export type RecordStatResult = {
	stats: { [subject: string]: MessageStat }
	droppedSubject: string | null
}

export function appendMessages(current: Message[], batch: Message[], max = MaxMessagesLength): AppendMessagesResult {
	if (!batch.length) return { messages: current, dropped: 0 }
	const next = current.length === 0 ? batch.slice() : current.concat(batch)
	if (next.length <= max) return { messages: next, dropped: 0 }
	return { messages: next.slice(next.length - max), dropped: next.length - max }
}

export function recordStat(
	stats: { [subject: string]: MessageStat },
	subject: string,
	now: number,
	max = MaxMessageStats,
): RecordStatResult {
	const existing = stats[subject]
	if (existing) {
		existing.counter++
		existing.last = now
		return { stats, droppedSubject: null }
	}
	const next = { ...stats, [subject]: { subject, counter: 1, last: now } }
	const keys = Object.keys(next)
	if (keys.length <= max) return { stats: next, droppedSubject: null }
	let oldestKey = keys[0]
	let oldestLast = next[oldestKey].last
	for (const key of keys) {
		if (next[key].last < oldestLast) {
			oldestKey = key
			oldestLast = next[key].last
		}
	}
	delete next[oldestKey]
	return { stats: next, droppedSubject: oldestKey }
}
