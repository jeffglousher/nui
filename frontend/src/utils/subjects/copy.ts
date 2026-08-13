import { CoreCatalog, JetStreamCatalog } from "@/types/Subject"
import { FILTER_INVALID, FILTER_REQUIRED, FILTER_TOO_BROAD, canListen } from "./filter"

export const LEGEND = [
	"A subject is a name a message travels on, like orders.created.",
	"Core is live and forgets. JetStream keeps messages. live means we just heard it. ORDERS or KV is the store that kept it.",
	"Type a prefix with a >, like orders.>, then click LISTEN.",
]

export function coreListenLabel(filter: string): string {
	const f = filter?.trim()
	if (!f) return FILTER_REQUIRED
	return f
}

export function listenHintCopy(hint?: string | null): string | null {
	if (!hint) return null
	if (hint == FILTER_REQUIRED) return "Type a name first, like orders.>, then click LISTEN."
	if (hint == FILTER_TOO_BROAD) return "Listening to every name at once is too broad. Try something like orders.>"
	if (hint == FILTER_INVALID) return "That is not a valid name. Use dots, like orders.created or orders.>"
	return hint
}

export function statusLines(
	coreEnabled: boolean,
	jsEnabled: boolean,
	core?: CoreCatalog | null,
	js?: JetStreamCatalog | null,
	occupied?: Record<string, { truncated?: boolean, error?: string, subjects?: unknown[] }>,
	filter?: string,
): string[] {
	const lines = [jetStreamStatus(jsEnabled, js), coreStatus(coreEnabled, core, filter)]
	const occupiedLine = occupiedStatus(occupied)
	if (occupiedLine) lines.push(occupiedLine)
	return lines
}

export function occupiedStatus(occupied?: Record<string, { truncated?: boolean, error?: string, subjects?: unknown[] }>): string | null {
	const rows = Object.values(occupied ?? {})
	if (rows.length == 0) return null
	const failed = rows.filter(r => r.error).length
	const truncated = rows.filter(r => r.truncated).length
	const bits: string[] = []
	if (truncated) bits.push("a stored list was capped")
	if (failed) bits.push("a stored list could not be read")
	if (bits.length == 0) return null
	const line = bits.join("; ")
	return line.charAt(0).toUpperCase() + line.slice(1) + "."
}

export function coreListenStale(core?: CoreCatalog | null, filter?: string): boolean {
	if (!core?.filter) return false
	if (filter == null) return false
	return filter.trim() != core.filter
}

export function coreStatus(enabled: boolean, core?: CoreCatalog | null, filter?: string): string {
	if (!enabled) return "Core is off."
	if (core?.error == "not allowed") return "This account cannot listen for that name."
	if (core?.error == "timed out") return "The listen stopped before it finished."
	if (core?.error == FILTER_REQUIRED) return "Type a name to listen, like orders.>"
	if (core?.error == FILTER_TOO_BROAD) return "Listening to every name at once is too broad. Try something like orders.>"
	if (core?.error == FILTER_INVALID) return "That is not a valid name. Use dots, like orders.created or orders.>"
	if (core?.error) return `Core could not listen: ${core.error}.`
	if (!core) {
		const next = filter?.trim()
		if (next && canListen(next)) return `Click LISTEN to sample ${next}.`
		return "Type a name to listen, like orders.>"
	}
	const names = core.heard ?? core.subjects?.length ?? 0
	const window = `${(core.listenMs / 1000).toFixed(1)}s`
	let line = `Core heard ${names} name${names == 1 ? "" : "s"} in ${window}`
	if (core.filter) line += ` on ${core.filter}`
	line += "."
	if (core.truncated) line += " List was capped."
	if (core.dropped) line += ` ${core.dropped} messages did not fit.`
	if (coreListenStale(core, filter)) {
		const next = filter?.trim()
		line += next ? ` Click LISTEN to sample ${next}.` : " Click LISTEN to sample the new name."
	}
	return line
}

export function jetStreamStatus(enabled: boolean, js?: JetStreamCatalog | null): string {
	if (!enabled) return "JetStream is off."
	if (!js) return "Reading stored names…"
	if (js.error == "not allowed") return "This account cannot read stored names."
	if (js.error == "timed out") return "Stored names were not fully read."
	if (js.error && (js.streams?.length ?? 0) == 0) {
		if (js.error == "not enabled on this server") {
			return "JetStream is not on this server. That store is optional. Core still works."
		}
		return `JetStream could not be read: ${js.error}.`
	}
	const names = js.streams?.reduce((sum, s) => sum + (s.subjects?.length ?? 0), 0) ?? 0
	const streams = js.streams?.length ?? 0
	let line = `JetStream has ${names} name${names == 1 ? "" : "s"} to keep in ${streams} stream${streams == 1 ? "" : "s"}.`
	if (js.failed) line += ` ${js.failed} stream${js.failed == 1 ? "" : "s"} could not be read.`
	if (js.truncated || js.streams?.some(s => s.truncated)) line += " List was capped."
	return line
}

export function emptyCopy(args: {
	coreEnabled: boolean
	jsEnabled: boolean
	core?: CoreCatalog | null
	js?: JetStreamCatalog | null
	search: string
	foundCount: number
}): string | null {
	const { coreEnabled, jsEnabled, core, js, search, foundCount } = args
	if (!coreEnabled && !jsEnabled) return "Turn on Core or JetStream to look."
	if (foundCount > 0) return null
	if (search?.trim()) return "No names match that search."

	const notAllowed = core?.error == "not allowed" || js?.error == "not allowed"
	if (notAllowed) return "This account cannot see those names."

	const notFullyRead = !!(
		core?.error == "timed out" || js?.error == "timed out"
		|| core?.truncated || js?.truncated || (js?.failed ?? 0) > 0
	)
	if (notFullyRead) return "The list was not fully read. Refresh to try again."

	if (jsEnabled && js?.error == "not enabled on this server") {
		if (coreEnabled && !core) return "JetStream is not on this server. Type a name to listen, like orders.> — Core only sees messages while we look."
		return "JetStream is not on this server. Core heard nothing in this listen — it only sees messages while we look."
	}

	if (coreEnabled && !core) {
		if (jsEnabled) return "No stored names yet. Type a name to listen, like orders.>, then click LISTEN. Core forgets anything that happened before we listened."
		return "Type a name to listen, like orders.>. Core does not remember the past."
	}

	if (coreEnabled && jsEnabled) {
		return "Quiet right now. Core forgets anything that happened before we listened. JetStream has no names to keep yet. Publish a message or create a stream, then click REFRESH."
	}
	if (coreEnabled) {
		return "Core heard nothing in this listen. It does not remember the past. Click LISTEN to try again, or turn on JetStream to see stored names."
	}
	return "No stored names. JetStream lists the names a stream is set to keep. Click a name with a ▸ to see which messages are in it."
}

export function firstListenCopy(filter: string, listenMs: number): string {
	return `Listening for ${(listenMs / 1000).toFixed(1)}s on ${filter}. Core only sees messages that happen during this listen.`
}

export function leafTitle(path: string, heard?: number, streams?: { name: string, count?: number }[]): string {
	const bits = [path]
	if (heard) bits.push(`heard ${heard} time${heard == 1 ? "" : "s"} just now`)
	for (const s of streams ?? []) {
		if (s.count) bits.push(`${s.count} stored in ${s.name}`)
		else bits.push(`kept by ${s.name}`)
	}
	return bits.join(" · ")
}
