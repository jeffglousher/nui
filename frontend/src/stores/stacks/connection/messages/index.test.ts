import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("@priolo/jon", () => ({ mixStores: (...stores: any[]) => stores[stores.length - 1], LISTENER_CHANGE: {} }))
vi.mock("@/api/messages", () => ({ default: {} }))
vi.mock("@/plugins/SocketService/pool", () => ({ socketPool: { getById: vi.fn(), destroy: vi.fn() } }))
vi.mock("@/plugins/SocketService", () => ({ SS_EVENTS: {} }))
vi.mock("@/stores/connections", () => ({ default: {} }))
vi.mock("@/stores/docs/utils/factory", () => ({ buildMessageDetail: vi.fn() }))
vi.mock("@/stores/stacks/viewBase", () => ({ default: { state: {}, actions: {}, getters: {} } }))
vi.mock("@/stores/stacks/connection/utils/factory", () => ({ buildConnectionMessageSend: vi.fn() }))
import setup from "./index"
import { MaxMessagesLength } from "./retain"

function store() {
	const s: any = { state: { ...setup.state, uuid: "batch-test", messages: [], stats: {}, noSysMessages: false }, getSocketServiceId: () => "test" }
	for (const [key, action] of Object.entries(setup.actions)) s[key] = (value?: unknown) => action(value as never, s)
	for (const [key, mutator] of Object.entries(setup.mutators)) s[key] = vi.fn((value: unknown) => Object.assign(s.state, mutator(value as never)))
	return s
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe("message batching", () => {
	it("bounds a burst before the flush timer runs", () => {
		vi.useFakeTimers()
		const s = store()
		for (let i = 0; i <= MaxMessagesLength; i++) s.addMessage({ subject: "orders.created", payload: String(i) })
		expect(s.state.messages).toHaveLength(MaxMessagesLength)
		vi.advanceTimersByTime(50)
		expect(s.state.messages).toHaveLength(MaxMessagesLength)
		expect(s.state.messages[0].payload).toBe("1")
		expect(s.state.messages.at(-1).payload).toBe(String(MaxMessagesLength))
		expect(s.setStats).toHaveBeenCalledTimes(2)
		s.sendSubscriptions()
		expect(s.state.messages).toHaveLength(MaxMessagesLength)
		expect(s.state.messages.at(-1).subject).toBe("NO SUBJECTS")
		s.disconnect()
	})
	it.each(["clearMessages", "disconnect"])("discards a pending batch on %s", action => {
		vi.useFakeTimers()
		const s = store()
		s.addMessage({ subject: "orders.created", payload: "pending" })
		s[action]()
		vi.advanceTimersByTime(100)
		expect(s.state.messages).toEqual([])
		s.disconnect()
	})
	it("cancels the old timer when subscriptions force a flush", () => {
		vi.useFakeTimers()
		const s = store()
		s.addMessage({ subject: "orders.created", payload: "first" })
		vi.advanceTimersByTime(25)
		s.sendSubscriptions()
		s.addMessage({ subject: "orders.created", payload: "second" })
		vi.advanceTimersByTime(25)
		expect(s.state.messages.some(m => m.payload == "second")).toBe(false)
		vi.advanceTimersByTime(25)
		expect(s.state.messages.at(-1).payload).toBe("second")
		s.disconnect()
	})
})
