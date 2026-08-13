import { CoreCatalog, JetStreamCatalog } from "@/types/Subject"
import { FILTER_INVALID, FILTER_REQUIRED, FILTER_TOO_BROAD } from "./filter"

export const LEGEND = [
	"A subject is a name a message travels on, like orders.created.",
	"Core is live and forgets. JetStream is a store that keeps messages.",
	"To listen, type a prefix with a >, like orders.>",
]

export function coreListenLabel(filter: string): string {
	const f = filter?.trim()
	if (!f) return FILTER_REQUIRED
	return f
}

export function statusLines(coreEnabled: boolean, jsEnabled: boolean, core?: CoreCatalog | null, js?: JetStreamCatalog | null): string[] {
	return [jetStreamStatus(jsEnabled, js), coreStatus(coreEnabled, core)]
}

export function coreStatus(enabled: boolean, core?: CoreCatalog | null): string {
	if (!enabled) return "Core is off."
	if (core?.error == "not allowed") return "This account cannot listen for that name."
	if (core?.error == "timed out") return "The listen stopped before it finished."
	if (core?.error == FILTER_REQUIRED) return "Type a name to listen, like orders.>"
	if (core?.error == FILTER_TOO_BROAD) return "Listening to every name at once is too broad. Try something like orders.>"
	if (core?.error == FILTER_INVALID) return "That is not a valid name. Use dots, like orders.created or orders.>"
	if (core?.error) return `Core could not listen: ${core.error}.`
	if (!core) return "Type a name to listen, like orders.>"
	const names = core.heard ?? core.subjects?.length ?? 0
	const window = `${(core.listenMs / 1000).toFixed(1)}s`
	let line = `Core heard ${names} name${names == 1 ? "" : "s"} in ${window}`
	if (core.filter) line += ` on ${core.filter}`
	line += "."
	if (core.truncated) line += " List was capped."
	if (core.dropped) line += ` ${core.dropped} messages did not fit.`
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
	let line = `JetStream has ${names} pattern${names == 1 ? "" : "s"} in ${streams} stream${streams == 1 ? "" : "s"}.`
	if (js.failed) line += ` ${js.failed} stream${js.failed == 1 ? "" : "s"} could not be read.`
	if (js.truncated) line += " List was capped."
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
	if (foundCount > 0) {
		if (search?.trim()) return "No names match that search."
		return null
	}

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
		if (jsEnabled) return "No stored patterns yet. Type a name to listen, like orders.>, then press Enter. Core forgets anything that happened before we listened."
		return "Type a name to listen, like orders.>. Core does not remember the past."
	}

	if (coreEnabled && jsEnabled) {
		return "Quiet right now. Core forgets anything that happened before we listened. JetStream has no capture patterns yet. Publish a message or create a stream, then refresh."
	}
	if (coreEnabled) {
		return "Core heard nothing in this listen. It does not remember the past. Refresh to listen again, or turn on JetStream to see stored names."
	}
	return "No stored patterns. JetStream lists the names a stream is set to keep. Expand a pattern to see names that currently have messages."
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
