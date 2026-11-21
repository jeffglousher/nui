import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStore } from "@priolo/jon"

vi.mock("@/stores/connections", () => ({ default: {} }))
vi.mock("@/stores/docs/utils/factory", () => ({ buildStore: vi.fn() }))
vi.mock("@/stores/stacks/viewBase", () => ({ default: { state: {}, actions: {}, getters: {} } }))
vi.mock("@/stores/stacks/loadBase", () => ({ default: { state: {}, actions: { fetch: vi.fn(), fetchAbort: vi.fn() } } }))
vi.mock("@/api/subjects", () => ({ default: { jetstream: vi.fn(), core: vi.fn(), occupied: vi.fn() } }))

vi.mock("@/api/streams", () => ({ default: { get: vi.fn() } }))

import setup from "./index"
import streamsApi from "@/api/streams"
import { buildStore } from "@/stores/docs/utils/factory"
import type { MessagesStore } from "../messages"
import type { StreamInfo } from "@/types/Stream"
import api from "@/api/subjects"
import { DOC_TYPE } from "@/types"
import { flattenHits, occupiedKey } from "@/utils/subjects/tree"

function deferred<T>() {
	let resolve: (value: T) => void
	const promise = new Promise<T>(r => { resolve = r })
	return { promise, resolve: (value: T) => resolve(value) }
}
function store() {
	const s: any = createStore(setup)
	s.state = { ...s.state, connectionId: "connection", uuid: "card", filter: "orders.>" }
	return s
}
const catalog = { filter: "orders.>", listenMs: 0, heard: 1, truncated: false, subjects: [{ subject: "orders.created", count: 1 }] }

beforeEach(() => vi.resetAllMocks())

describe("SUBJECTS requests", () => {
	it("only samples Core after an explicit action with a valid filter", async () => {
		const s = store()
		vi.mocked(api.jetstream).mockResolvedValue({ streams: [] })
		await s.fetchIfVoid()
		await s.fetch()
		s.state.filter = ""
		await s.sampleNow()
		await s.toggleNoSysMessages()
		expect(api.core).not.toHaveBeenCalled()
		s.state.filter = "orders.>"
		vi.mocked(api.core).mockResolvedValue(catalog)
		await s.sampleNow()
		expect(api.core).toHaveBeenCalledExactlyOnceWith("connection", "orders.>", 2000, false, expect.anything())
		expect(s.state.core).toEqual(catalog)
	})

	it.each(["disposeSubjects", "toggleCore", "toggleNoSysMessages"])("ignores a sample response after %s", async action => {
		const s = store()
		s.state.jetstreamEnabled = false
		const pending = deferred<typeof catalog>()
		vi.mocked(api.core).mockReturnValue(pending.promise)
		const fetch = s.sampleNow()
		await s[action]()
		const current = s.state.core
		expect(vi.mocked(api.core).mock.calls[0][4].signal.aborted).toBe(true)
		pending.resolve(catalog)
		await fetch
		expect(s.state.core).toEqual(current)
		expect(s.state.coreSampling).toBe(false)
	})

	it.each([
		["orders.created", true], ["orders.>", true], ["$KV.shop.>", false],
	] as const)("opens %s in a separate live card", (subject, noSysMessages) => {
		const s = store()
		const existing = { subscriptions: [{ subject: "other.>" }], pause: true, messages: [{ subject: "other.one" }] }
		s.state.linked = { state: structuredClone(existing) }
		s.state.group = { add: vi.fn(), getIndexByView: () => 0 }
		const view = {} as MessagesStore
		vi.mocked(buildStore).mockReturnValue(view)
		s.openLive(subject)
		expect(buildStore).toHaveBeenCalledWith(expect.objectContaining({
			type: DOC_TYPE.MESSAGES, connectionId: "connection", subscriptions: [{ subject }], noSysMessages,
		}))
		expect(s.state.group.add).toHaveBeenCalledWith(expect.objectContaining({ view }))
		expect(s.state.linked.state).toEqual(existing)
	})

	it("opens history using the explicitly chosen stream and subject", async () => {
		const s = store()
		s.state.select = "orders.created"
		s.state.group = { add: vi.fn(), getIndexByView: () => 0 }
		const stream = { config: { name: "SECOND" }, state: { firstSeq: 1, lastSeq: 47 } } as StreamInfo
		vi.mocked(streamsApi.get).mockResolvedValue(stream)
		await s.openHistory({ subject: "orders.created", streamName: "SECOND" })
		expect(streamsApi.get).toHaveBeenCalledWith("connection", "SECOND", expect.anything(), "orders.created")
		expect(buildStore).toHaveBeenCalledWith(expect.objectContaining({
			type: DOC_TYPE.STREAM_MESSAGES, stream, filter: { subjects: ["orders.created"] },
		}))
		expect(s.state.group.add).toHaveBeenCalledOnce()
	})

	it("keeps the newer sample when an aborted request resolves last", async () => {
		const s = store()
		const first = deferred<typeof catalog>()
		const second = deferred<typeof catalog>()
		vi.mocked(api.core).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		const oldRequest = s.fetchCore()
		s.state.filter = "devices.>"
		const newRequest = s.fetchCore()
		const current = { ...catalog, filter: "devices.>", subjects: [{ subject: "devices.room", count: 1 }] }
		second.resolve(current)
		await newRequest
		first.resolve(catalog)
		await oldRequest
		expect(s.state.core).toEqual(current)
	})

	it("discards occupied results from an earlier filter", async () => {
		const s = store()
		const pending = deferred<any>()
		vi.mocked(api.occupied).mockReturnValue(pending.promise)
		const fetch = s.loadOccupied({ name: "ORDERS", pattern: "orders.>" })
		s.state.jetstreamEnabled = false
		await s.toggleNoSysMessages()
		pending.resolve({ stream: "ORDERS", subjects: [{ subject: "$SYS.private", kind: "occupied" }] })
		await fetch
		expect(s.state.occupied).toEqual({})
	})

	it("refreshes previously expanded stored names", async () => {
		const s = store()
		const key = occupiedKey("ORDERS", "orders.>")
		s.state.occupied = {
			[key]: { stream: "ORDERS", subjects: [{ subject: "orders.old", kind: "occupied" }] },
			[occupiedKey("REMOVED", "removed.>")]: { stream: "REMOVED", subjects: [{ subject: "removed.old", kind: "occupied" }] },
		}
		vi.mocked(api.jetstream).mockResolvedValue({ streams: [{ name: "ORDERS", kind: "stream", subjects: [{ subject: "orders.>", pattern: "orders.>", kind: "pattern" }] }] })
		const pending = deferred<any>()
		const current = { stream: "ORDERS", subjects: [{ subject: "orders.new", kind: "occupied" }] }
		vi.mocked(api.occupied).mockReturnValue(pending.promise)
		const refresh = s.fetchJetStream()
		await Promise.resolve()
		expect(s.state.occupied[occupiedKey("REMOVED", "removed.>")]).toBeUndefined()
		pending.resolve(current)
		await refresh
		expect(s.state.occupied).toEqual({ [key]: current })
	})

	it.each([true, false])("keeps a pending expansion only if its pattern remains after Refresh: %s", async retained => {
		const s = store()
		const catalog = deferred<any>(), occupied = deferred<any>()
		const source = { name: "ORDERS", pattern: "orders.>" }
		const current = { stream: "ORDERS", subjects: [{ subject: "orders.created", kind: "occupied" }] }
		vi.mocked(api.jetstream).mockReturnValue(catalog.promise)
		vi.mocked(api.occupied).mockReturnValue(occupied.promise)
		const refresh = s.fetchJetStream()
		const expand = s.loadOccupied(source)
		catalog.resolve({ streams: retained ? [{ name: "ORDERS", kind: "stream", subjects: [{ subject: "orders.>", pattern: "orders.>", kind: "pattern" }] }] : [] })
		await refresh
		occupied.resolve(current)
		await expand
		expect(s.state.occupied).toEqual(retained ? { [occupiedKey("ORDERS", "orders.>")]: current } : {})
		expect(s.state.occupiedLoading).toEqual({})
		expect(api.occupied).toHaveBeenCalledOnce()
	})

	it("deduplicates each stored expansion while other names are loading", async () => {
		const s = store()
		const first = deferred<any>(), second = deferred<any>()
		const firstSource = { name: "A::B", pattern: "C.>" }
		const secondSource = { name: "A", pattern: "B::C.>" }
		const firstCatalog = { stream: "A::B", subjects: [{ subject: "C.one", kind: "occupied", count: 3 }] }
		const secondCatalog = { stream: "A", subjects: [{ subject: "B::C.one", kind: "occupied", count: 9 }] }
		vi.mocked(api.occupied).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		const a = s.loadOccupied(firstSource), b = s.loadOccupied(secondSource)
		await s.loadOccupied(firstSource)
		expect(api.occupied).toHaveBeenCalledTimes(2)
		expect(api.occupied).toHaveBeenNthCalledWith(1, "connection", "A::B", "C.>", true, expect.anything())
		expect(api.occupied).toHaveBeenNthCalledWith(2, "connection", "A", "B::C.>", true, expect.anything())
		second.resolve(secondCatalog)
		await b
		await s.loadOccupied(firstSource)
		expect(api.occupied).toHaveBeenCalledTimes(2)
		first.resolve(firstCatalog)
		await a
		expect(s.state.occupied).toEqual({
			[occupiedKey("A::B", "C.>")]: firstCatalog,
			[occupiedKey("A", "B::C.>")]: secondCatalog,
		})
		const hits = flattenHits({ showCore: false, showJetStream: true, occupied: s.state.occupied,
			jetstream: { streams: [
				{ name: "A", kind: "stream", subjects: [{ subject: "B::C.>", pattern: "B::C.>", kind: "pattern" }] },
				{ name: "A::B", kind: "stream", subjects: [{ subject: "C.>", pattern: "C.>", kind: "pattern" }] },
			] },
		})
		expect(hits.find(h => h.subject == "C.one")?.parent).toBe("C.>")
		expect(hits.find(h => h.subject == "B::C.one")?.parent).toBe("B::C.>")
	})

	it.each(["old-first", "new-first"])("keeps only the current stored request after invalidation: %s", async order => {
		const s = store()
		s.state.jetstreamEnabled = false
		const first = deferred<any>(), second = deferred<any>()
		const source = { name: "ORDERS", pattern: "orders.>" }
		const current = { stream: "ORDERS", subjects: [{ subject: "orders.new", count: 20 }] }
		vi.mocked(api.occupied).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		const oldRequest = s.loadOccupied(source)
		await s.toggleNoSysMessages()
		const newRequest = s.loadOccupied(source)
		if (order == "new-first") { second.resolve(current); await newRequest }
		first.resolve({ stream: "ORDERS", subjects: [{ subject: "orders.old", count: 10 }] })
		await oldRequest
		await s.loadOccupied(source)
		expect(api.occupied).toHaveBeenCalledTimes(2)
		if (order == "old-first") { second.resolve(current); await newRequest }
		expect(s.state.occupied[occupiedKey("ORDERS", "orders.>")]).toEqual(current)
	})
})
