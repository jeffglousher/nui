import { describe, expect, it } from "vitest"
import { appendMessages, recordStat, MaxMessagesLength, MaxMessageStats, MessageStat } from "./retain"
import { Message } from "@/types/Message"

function msg(subject: string, i: number): Message {
	return { subject, payload: `p${i}`, receivedAt: i }
}

describe("appendMessages", () => {
	it("keeps the newest window once the cap is crossed", () => {
		const current = Array.from({ length: MaxMessagesLength }, (_, i) => msg("flood", i))
		const next = appendMessages(current, [msg("flood", MaxMessagesLength)])
		expect(next).toHaveLength(MaxMessagesLength)
		expect(next[0].receivedAt).toBe(1)
		expect(next[next.length - 1].receivedAt).toBe(MaxMessagesLength)
	})

	it("appends a batch under the cap without dropping", () => {
		const next = appendMessages([msg("a", 1)], [msg("b", 2), msg("c", 3)])
		expect(next.map(m => m.subject)).toEqual(["a", "b", "c"])
	})
})

describe("recordStat", () => {
	it("drops the coldest subject when the map is full", () => {
		let stats: { [subject: string]: MessageStat } = {}
		for (let i = 0; i < MaxMessageStats; i++) {
			stats = recordStat(stats, `s.${i}`, i)
		}
		expect(Object.keys(stats)).toHaveLength(MaxMessageStats)
		stats = recordStat(stats, "s.new", MaxMessageStats + 10)
		expect(stats["s.0"]).toBeUndefined()
		expect(stats["s.new"].counter).toBe(1)
		expect(Object.keys(stats)).toHaveLength(MaxMessageStats)
	})

	it("increments an existing subject in place", () => {
		const stats = recordStat({}, "flood.1", 1)
		const again = recordStat(stats, "flood.1", 2)
		expect(again["flood.1"].counter).toBe(2)
		expect(again["flood.1"].last).toBe(2)
	})
})
