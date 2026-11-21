import { describe, expect, it, vi } from "vitest"
vi.mock("@/plugins/AjaxService", () => ({ default: { get: vi.fn() } }))
import ajax from "@/plugins/AjaxService"
import api from "./subjects"
import { encodeUrl } from "@/plugins/AjaxService/utils"

describe("subjects API", () => {
	it("encodes a stream name once", async () => {
		await api.occupied("id", "orders%20", "orders.>", true)
		const url = vi.mocked(ajax.get).mock.lastCall[0]
		expect(encodeUrl(url)).toContain("orders%2520/occupied")
		expect(encodeUrl(url)).not.toContain("orders%252520")
	})
})
