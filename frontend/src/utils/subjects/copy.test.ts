import { describe, expect, it } from "vitest"
import { emptyCopy, jetStreamStatus, coreStatus, coreListenLabel, LEGEND, leafTitle } from "./copy"

describe("copy", () => {
	it("defines Core and JetStream without assuming the reader knows NATS", () => {
		expect(LEGEND[0]).toMatch(/name a message travels on/i)
		expect(LEGEND[1]).toMatch(/forget/i)
		expect(LEGEND[1]).toMatch(/store/i)
	})

	it("says all names instead of >", () => {
		expect(coreListenLabel(">")).toBe("all names")
		expect(coreListenLabel("")).toBe("all names")
		expect(coreListenLabel("orders.>")).toBe("orders.>")
	})

	it("does not mix a live listen count with a stored count", () => {
		expect(coreStatus({
			enabled: true, filter: ">", listenMs: 2000, heard: 4, truncated: false, subjects: [],
		})).toBe("Core heard 4 names in 2.0s.")
		expect(jetStreamStatus({
			enabled: true, streams: [{ name: "ORDERS", subjects: [{ subject: "a", count: 40 }, { subject: "b", count: 1 }] }],
		})).toBe("JetStream is keeping 2 names in 1 stream.")
	})

	it("teaches why an empty listen is not a broken server", () => {
		const copy = emptyCopy({
			capturedAt: "2026-01-01T00:00:00Z",
			core: { enabled: true, filter: ">", listenMs: 2000, heard: 0, truncated: false, subjects: [] },
			jetstream: { enabled: true, streams: [] },
		}, "")
		expect(copy).toMatch(/forget/i)
		expect(copy).toMatch(/stored/i)
		expect(copy).not.toMatch(/snapshot/i)
		expect(copy).not.toMatch(/enumerat/i)
	})

	it("says JetStream is optional when the server has none", () => {
		expect(jetStreamStatus({
			enabled: true, error: "not enabled on this server", streams: [],
		})).toMatch(/optional/i)
	})

	it("describes a leaf without adding live and stored numbers together", () => {
		expect(leafTitle("orders.created", 3, [{ name: "ORDERS", count: 40 }])).toBe(
			"orders.created · heard 3 times just now · 40 stored in ORDERS",
		)
	})
})
