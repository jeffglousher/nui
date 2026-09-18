import { describe, expect, it } from "vitest"
import { appendMessages, recordStat, MaxMessagesLength, MaxMessageStats, MessageStat } from "./retain"
import { Message } from "@/types/Message"

function msg(subject: string, i: number): Message {
	return { subject, payload: `p${i}`, receivedAt: i }
}

describe("appendMessages", () => {
	it("keeps the newest window once the cap is crossed", () => {
		const current = Array.from({ length: MaxMessagesLength }, (_, i) => msg("flood", i))
		const { messages, dropped } = appendMessages(current, [msg("flood", MaxMessagesLength)])
		expect(messages).toHaveLength(MaxMessagesLength)
		expect(dropped).toBe(1)
		expect(messages[0].receivedAt).toBe(1)
		expect(messages[messages.length - 1].receivedAt).toBe(MaxMessagesLength)
	})

	it("appends a batch under the cap without dropping", () => {
		const { messages, dropped } = appendMessages([msg("a", 1)], [msg("b", 2), msg("c", 3)])
		expect(messages.map(m => m.subject)).toEqual(["a", "b", "c"])
		expect(dropped).toBe(0)
	})
})

describe("recordStat", () => {
	it("drops the coldest subject when the map is full", () => {
		let stats: { [subject: string]: MessageStat } = {}
		for (let i = 0; i < MaxMessageStats; i++) {
			stats = recordStat(stats, `s.${i}`, i).stats
		}
		expect(Object.keys(stats)).toHaveLength(MaxMessageStats)
		const { stats: next, droppedSubject } = recordStat(stats, "s.new", MaxMessageStats + 10)
		expect(droppedSubject).toBe("s.0")
		expect(next["s.0"]).toBeUndefined()
		expect(next["s.new"].counter).toBe(1)
		expect(Object.keys(next)).toHaveLength(MaxMessageStats)
	})

	it("increments an existing subject in place", () => {
		const first = recordStat({}, "flood.1", 1)
		expect(first.droppedSubject).toBeNull()
		const again = recordStat(first.stats, "flood.1", 2)
		expect(again.droppedSubject).toBeNull()
		expect(again.stats["flood.1"].counter).toBe(2)
		expect(again.stats["flood.1"].last).toBe(2)
	})
})
