import { describe, expect, it } from "vitest"
import { appendMessages, recordStat, MaxMessagesLength, MaxMessageStats, MessageStat } from "./retain"
import { Message } from "@/types/Message"

function msg(subject: string, i: number): Message {
	return { subject, payload: `p${i}`, receivedAt: i }
}

describe("appendMessages", () => {
	it("keeps the newest window once the cap is crossed", () => {
		const current = Array.from({ length: MaxMessagesLength }, (_, i) => msg("flood", i))
		const messages = appendMessages(current, [msg("flood", MaxMessagesLength)])
		expect(messages).toHaveLength(MaxMessagesLength)
		expect(messages[0].receivedAt).toBe(1)
		expect(messages[messages.length - 1].receivedAt).toBe(MaxMessagesLength)
	})

	it("appends a batch under the cap without dropping", () => {
		const messages = appendMessages([msg("a", 1)], [msg("b", 2), msg("c", 3)])
		expect(messages.map(m => m.subject)).toEqual(["a", "b", "c"])
	})
})

describe("recordStat", () => {
	it.each(["constructor", "__proto__", "toString"])("records %s as a subject", subject => {
		const first = recordStat({}, subject, 1)
		const next = recordStat(first, subject, 2)
		expect(Object.keys(next)).toEqual([subject])
		expect(next[subject]).toEqual({ subject, counter: 2, last: 2 })
	})
	it("drops the coldest subject when the map is full", () => {
		let stats: { [subject: string]: MessageStat } = {}
		for (let i = 0; i < MaxMessageStats; i++) {
			stats = recordStat(stats, `s.${i}`, i)
		}
		expect(Object.keys(stats)).toHaveLength(MaxMessageStats)
		const next = recordStat(stats, "s.new", MaxMessageStats + 10)
		expect(next["s.0"]).toBeUndefined()
		expect(next["s.new"].counter).toBe(1)
		expect(Object.keys(next)).toHaveLength(MaxMessageStats)
	})

	it("increments an existing subject in place", () => {
		const first = recordStat({}, "flood.1", 1)
		const again = recordStat(first, "flood.1", 2)
		expect(again["flood.1"].counter).toBe(2)
		expect(again["flood.1"].last).toBe(2)
	})
})
