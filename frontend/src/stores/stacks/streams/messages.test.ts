import { describe, expect, it, vi } from "vitest"
vi.mock("@priolo/jon", () => ({ mixStores: (...stores: any[]) => stores[stores.length - 1] }))
vi.mock("@/api/streams", () => ({ default: { messages: vi.fn() } }))
vi.mock("@/stores/docs/utils/factory", () => ({ buildMessageDetail: vi.fn() }))
vi.mock("@/stores/stacks/viewBase", () => ({ default: {} }))
vi.mock("../editorBase", () => ({ default: {} }))
vi.mock("../loadBase", () => ({ default: {} }))
import streamsApi from "@/api/streams"
import setup, { MaxStreamMessagesLength } from "./messages"

describe("stream message paging", () => {
	it.each([true, false])("retains the requested page when paging backwards=%s", async backwards => {
		const messages = Array.from({ length: MaxStreamMessagesLength }, (_, i) => ({ seqNum: i + 101 }))
		const incoming = [{ seqNum: backwards ? 100 : MaxStreamMessagesLength + 101 }]
		vi.mocked(streamsApi.messages).mockResolvedValue(incoming as any)
		const store: any = {
			state: { messages, stream: { config: { name: "ORDERS" }, state: { firstSeq: 1 } } },
			setMessages: value => { store.state.messages = value },
		}
		await setup.actions.fetchWithFilter({ startSeq: incoming[0].seqNum, interval: backwards ? -1 : 1, subjects: [] }, store)
		expect(store.state.messages).toHaveLength(MaxStreamMessagesLength)
		expect(store.state.messages[0].seqNum).toBe(backwards ? 100 : 102)
		expect(store.state.messages.at(-1).seqNum).toBe(backwards ? MaxStreamMessagesLength + 99 : MaxStreamMessagesLength + 101)
	})
})
