import { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { SubjectsStore } from "@/stores/stacks/connection/subjects"

vi.mock("@/components/cards/FrameworkCard", () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/stores/layout", () => ({ default: { state: { theme: "boring" } } }))
vi.mock("@priolo/jon", () => ({ useStore: (store: { state: unknown }) => store.state }))
vi.mock("./FilterDialog", () => ({ default: () => null }))
vi.mock("@priolo/jack", () => ({
	LOAD_STATE: { LOADING: 1 },
	Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
	IconButton: ({ children }: { children: ReactNode }) => <button>{children}</button>,
	TooltipWrapCmp: ({ children }: { children: ReactNode }) => children,
	TextInput: () => null,
	FindInputHeader: () => null,
	CopyButton: ({ label }: { label: string }) => <button>{label}</button>,
}))

import SubjectsView from "./View"
import SubjectTree from "./Tree"

describe("SUBJECTS rendering", () => {
	it.each(["", "orders.created"])("keeps folders closed with search %j", textSearch => {
		const store = { state: {
			group: { state: {} }, coreEnabled: false, jetstreamEnabled: true,
			noSysMessages: true, filter: "", textSearch, occupied: {}, occupiedLoading: {},
			jetstream: { streams: [{ name: "ORDERS", kind: "stream", subjects: [
				{ subject: "orders.created", kind: "pattern" },
				{ subject: "orders.cancelled", kind: "pattern" },
			] }] },
		} } as unknown as SubjectsStore
		const markup = renderToStaticMarkup(<SubjectsView store={store} />)
		expect(markup).toContain('aria-label="Expand orders"')
		expect(markup).toContain('aria-expanded="false"')
		expect(markup).not.toContain('title="orders.created')
		expect(markup).not.toContain('title="orders.cancelled')
	})

	it("renders a remainder without button semantics or copy controls", () => {
		const markup = renderToStaticMarkup(<SubjectTree nodes={[{
			path: "orders.more", segment: "… 12 more", names: 12, children: [], remainder: true,
		}]} />)
		expect(markup).toContain("… 12 more")
		expect(markup).not.toMatch(/role="button"|tabindex=|aria-expanded=|<button/)
	})

	it.each([["orders.>", true], ["orders", false]])("offers a live subscription for a catalog pattern but skips a grouping folder (%s)", (select, canOpen) => {
		const store = { state: {
			group: { state: {} }, coreEnabled: false, jetstreamEnabled: true, select,
			jetstream: { streams: [{ name: "ORDERS", kind: "stream", subjects: [
				{ subject: "orders.>", pattern: "orders.>", kind: "pattern" },
			] }] },
		} } as unknown as SubjectsStore
		const markup = renderToStaticMarkup(<SubjectsView store={store} />)
		expect(markup.includes("OPEN LIVE MESSAGES")).toBe(canOpen)
		expect(markup).not.toContain("VIEW HISTORY")
	})

	it("offers history for a literal capture even if another stream transforms it", () => {
		const subject = "orders"
		const store = { state: {
			group: { state: {} }, coreEnabled: false, jetstreamEnabled: true,
			noSysMessages: true, filter: "", select: subject, occupied: {}, occupiedLoading: {},
			jetstream: { streams: [
				{ name: "RAW", kind: "stream", subjects: [{ subject, pattern: subject, kind: "pattern" }] },
				{ name: "TRANSFORMED", kind: "stream", transformed: true, subjects: [{ subject, pattern: subject, kind: "pattern" }] },
			] },
		} } as unknown as SubjectsStore
		const markup = renderToStaticMarkup(<SubjectsView store={store} />)
		expect(markup).toContain("VIEW HISTORY · RAW")
		expect(markup).not.toContain("VIEW HISTORY · TRANSFORMED")
		expect(markup).toContain('aria-label="Expand orders"')
	})
})
