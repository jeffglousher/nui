import { describe, expect, it } from "vitest"
import { focusWatch, isFamilyCapture, preferredWatchPattern, watchFilter } from "./watch"

describe("isFamilyCapture", () => {
	it("treats only a wildcard, KV, or object as a folder", () => {
		expect(isFamilyCapture("pattern", "close")).toBe(false)
		expect(isFamilyCapture("pattern", "foo.>")).toBe(true)
		expect(isFamilyCapture("pattern", "jetris.chat.*")).toBe(true)
		expect(isFamilyCapture("kv", "$KV.shop")).toBe(true)
		expect(isFamilyCapture("object", "$O.files")).toBe(true)
		expect(isFamilyCapture("occupied", "foo.bar")).toBe(false)
	})
})

describe("preferredWatchPattern", () => {
	it("picks the family when an exact capture shares the row", () => {
		expect(preferredWatchPattern([{ pattern: "foo" }, { pattern: "foo.>" }])).toBe("foo.>")
		expect(preferredWatchPattern([{ pattern: "close" }])).toBe("close")
	})
})

describe("watchFilter", () => {
	it("watches a live or stored name as itself", () => {
		expect(watchFilter({ path: "orders.created", hit: { subject: "orders.created", kind: "live" } })).toBe("orders.created")
		expect(watchFilter({ path: "orders.created", hit: { subject: "orders.created", kind: "occupied" } })).toBe("orders.created")
	})

	it("watches a stream pattern as the name that stream actually captures", () => {
		expect(watchFilter({ path: "orders.>", hit: { subject: "orders.>", kind: "pattern" } })).toBe("orders.>")
		expect(watchFilter({
			path: "foo",
			hit: { subject: "foo", kind: "pattern", expandable: true, streams: [{ pattern: "foo.>" }] },
		})).toBe("foo.>")
		expect(watchFilter({ path: "orders", hit: { subject: "orders", kind: "pattern" } })).toBe("orders.>")
	})

	it("watches an exact stream capture as itself, not a invented family", () => {
		expect(watchFilter({
			path: "close",
			hit: { subject: "close", kind: "pattern", streams: [{ pattern: "close" }] },
		})).toBe("close")
	})

	it("prefers the family when one keeper is exact and another is a prefix", () => {
		expect(watchFilter({
			path: "foo",
			hit: {
				subject: "foo",
				kind: "pattern",
				expandable: true,
				streams: [{ pattern: "foo" }, { pattern: "foo.>" }],
			},
		})).toBe("foo.>")
	})

	it("watches a family folder as that prefix, even if the token itself was heard", () => {
		expect(watchFilter({
			path: "agents",
			children: [{}],
			hit: { subject: "agents", kind: "live" },
		})).toBe("agents.>")
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

describe("focusWatch", () => {
	it("watches only the name you clicked", () => {
		expect(focusWatch([
			{ subject: "orders.created", disabled: false, favorite: true },
			{ subject: "returns.>", disabled: false, favorite: true },
		], "ghost.>")).toEqual([
			{ subject: "orders.created", disabled: true, favorite: true },
			{ subject: "returns.>", disabled: true, favorite: true },
			{ subject: "ghost.>", disabled: false, favorite: false },
		])
	})

	it("does not grow a second row for the same name", () => {
		expect(focusWatch([
			{ subject: "orders.created", disabled: true, favorite: false },
			{ subject: "returns.>", disabled: false, favorite: true },
		], "orders.created")).toEqual([
			{ subject: "orders.created", disabled: false, favorite: false },
			{ subject: "returns.>", disabled: true, favorite: true },
		])
	})

	it("does not pin a catalog click as a saved favorite", () => {
		expect(focusWatch([], "orders.created")).toEqual([
			{ subject: "orders.created", disabled: false, favorite: false },
		])
	})

	it("drops earlier catalog clicks that were never saved", () => {
		expect(focusWatch([
			{ subject: "orders.created", disabled: false, favorite: false },
			{ subject: "returns.>", disabled: true, favorite: true },
		], "ghost.>")).toEqual([
			{ subject: "returns.>", disabled: true, favorite: true },
			{ subject: "ghost.>", disabled: false, favorite: false },
		])
	})

	it("ignores a blank name", () => {
		expect(focusWatch([{ subject: "orders.created" }], "  ")).toEqual([
			{ subject: "orders.created" },
		])
	})
})
