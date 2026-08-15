import { describe, expect, it, beforeEach } from "vitest"
import { limitLogDue, resetLimitLog } from "./limitLog"

describe("limitLogDue", () => {
	beforeEach(() => resetLimitLog())

	it("logs the first hit immediately", () => {
		expect(limitLogDue("tail", 10_000, 1_000)).toBe(true)
	})

	it("suppresses repeats inside the interval", () => {
		expect(limitLogDue("tail", 10_000, 1_000)).toBe(true)
		expect(limitLogDue("tail", 10_000, 5_000)).toBe(false)
		expect(limitLogDue("tail", 10_000, 10_999)).toBe(false)
	})

	it("logs again once the interval has passed", () => {
		expect(limitLogDue("tail", 10_000, 1_000)).toBe(true)
		expect(limitLogDue("tail", 10_000, 11_000)).toBe(true)
	})

	it("tracks keys independently", () => {
		expect(limitLogDue("tail", 10_000, 1_000)).toBe(true)
		expect(limitLogDue("stats", 10_000, 1_000)).toBe(true)
		expect(limitLogDue("tail", 10_000, 2_000)).toBe(false)
	})

	it("always logs when the interval is 0", () => {
		expect(limitLogDue("once", 0, 1)).toBe(true)
		expect(limitLogDue("once", 0, 2)).toBe(true)
	})
})
