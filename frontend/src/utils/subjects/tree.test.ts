import { describe, expect, it } from "vitest"
import { SubjectHit, SubjectsSnapshot } from "@/types/Subject"
import { buildSubjectTree, countLeaves, filterTree, flattenHits } from "./tree"

function hit(subject: string, opts: Partial<SubjectHit> = {}): SubjectHit {
	return { subject, streams: [], ...opts }
}

describe("flattenHits", () => {
	it("merges the same name from core and a stream without adding their counts", () => {
		const snapshot: SubjectsSnapshot = {
			capturedAt: "2026-01-01T00:00:00Z",
			core: {
				enabled: true, filter: ">", listenMs: 2000, heard: 1, truncated: false,
				subjects: [{ subject: "orders.created", count: 2, lastPayload: "abc" }],
			},
			jetstream: {
				enabled: true,
				streams: [{ name: "ORDERS", subjects: [{ subject: "orders.created", count: 40 }] }],
			},
		}
		const hits = flattenHits(snapshot)
		expect(hits).toHaveLength(1)
		expect(hits[0].core?.count).toBe(2)
		expect(hits[0].streams).toEqual([{ name: "ORDERS", count: 40 }])
	})

	it("ignores disabled sources", () => {
		const snapshot: SubjectsSnapshot = {
			capturedAt: "2026-01-01T00:00:00Z",
			core: { enabled: false, filter: ">", listenMs: 2000, heard: 0, truncated: false, subjects: [{ subject: "x", count: 1 }] },
			jetstream: { enabled: false, streams: [{ name: "S", subjects: [{ subject: "y", count: 1 }] }] },
		}
		expect(flattenHits(snapshot)).toEqual([])
	})
})

describe("buildSubjectTree", () => {
	it("splits on dots and keeps a node that is both a name and a parent", () => {
		const tree = buildSubjectTree([
			hit("devices.sensors.temp", { core: { count: 3 } }),
			hit("devices.sensors.humidity", { streams: [{ name: "IOT", count: 9 }] }),
			hit("devices", { core: { count: 1 } }),
		])
		expect(tree).toHaveLength(1)
		expect(tree[0].segment).toBe("devices")
		expect(tree[0].hit?.core?.count).toBe(1)
		expect(tree[0].children[0].children.map(c => c.segment)).toEqual(["humidity", "temp"])
		expect(tree[0].names).toBe(3)
		expect(countLeaves(tree)).toBe(3)
	})

	it("inserts many siblings without losing any", () => {
		const hits = Array.from({ length: 80 }, (_, i) => hit(`root.n${i.toString().padStart(2, "0")}`))
		const tree = buildSubjectTree(hits)
		expect(tree[0].children).toHaveLength(80)
		expect(tree[0].names).toBe(80)
	})
})

describe("filterTree", () => {
	it("keeps ancestors of a matching leaf", () => {
		const tree = buildSubjectTree([
			hit("shop.orders.created"),
			hit("shop.users.login"),
		])
		const filtered = filterTree(tree, "login")
		expect(filtered).toHaveLength(1)
		expect(filtered[0].children[0].segment).toBe("users")
		expect(countLeaves(filtered)).toBe(1)
	})
})
