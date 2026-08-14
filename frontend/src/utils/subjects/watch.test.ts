import { describe, expect, it } from "vitest"
import { mergeWatch, watchFilter } from "./watch"

describe("watchFilter", () => {
	it("watches a live or stored name as itself", () => {
		expect(watchFilter({ path: "orders.created", hit: { subject: "orders.created", kind: "live" } })).toBe("orders.created")
		expect(watchFilter({ path: "orders.created", hit: { subject: "orders.created", kind: "occupied" } })).toBe("orders.created")
	})

	it("watches a stream pattern as itself", () => {
		expect(watchFilter({ path: "orders.>", hit: { subject: "orders.>", kind: "pattern" } })).toBe("orders.>")
		expect(watchFilter({ path: "orders", hit: { subject: "orders", kind: "pattern" } })).toBe("orders")
	})

	it("watches a KV or object bucket as that family", () => {
		expect(watchFilter({ path: "$KV.kv1", hit: { subject: "$KV.kv1", kind: "kv" } })).toBe("$KV.kv1.>")
		expect(watchFilter({ path: "$O.files", hit: { subject: "$O.files", kind: "object" } })).toBe("$O.files.>")
	})

	it("watches a closed family as that prefix", () => {
		expect(watchFilter({ path: "ghost" })).toBe("ghost.>")
	})

	it("does not watch a leftover stack count", () => {
		expect(watchFilter({ path: "orders.created", remainder: true })).toBeNull()
	})
})

describe("mergeWatch", () => {
	it("adds a name to the MESSAGES list and keeps it", () => {
		expect(mergeWatch([], "orders.created")).toEqual([
			{ subject: "orders.created", disabled: false, favorite: true },
		])
	})

	it("reuses an existing row instead of adding a second", () => {
		expect(mergeWatch([
			{ subject: "orders.created", disabled: true, favorite: false },
			{ subject: "returns.>", disabled: false, favorite: true },
		], "orders.created")).toEqual([
			{ subject: "orders.created", disabled: false, favorite: true },
			{ subject: "returns.>", disabled: false, favorite: true },
		])
	})

	it("ignores a blank name", () => {
		expect(mergeWatch([{ subject: "orders.created" }], "  ")).toEqual([
			{ subject: "orders.created" },
		])
	})
})
