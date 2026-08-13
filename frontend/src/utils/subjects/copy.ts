import { CoreSnapshot, JetStreamSnapshot, SubjectsSnapshot } from "@/types/Subject"

export const LEGEND = [
	"A subject is a name a message travels on, like orders.created.",
	"Core is live and forgets. JetStream is a store that keeps messages.",
]

export function coreListenLabel(filter: string): string {
	const f = filter?.trim()
	if (!f || f == ">") return "all names"
	return f
}

export function statusLines(core?: CoreSnapshot, js?: JetStreamSnapshot): string[] {
	return [jetStreamStatus(js), coreStatus(core)]
}

export function coreStatus(core?: CoreSnapshot): string {
	if (!core?.enabled) return "Core is off."
	if (core.error) return `Core could not listen: ${core.error}.`
	const names = core.heard ?? core.subjects?.length ?? 0
	const window = `${(core.listenMs / 1000).toFixed(1)}s`
	const where = coreListenLabel(core.filter)
	let line = `Core heard ${names} name${names == 1 ? "" : "s"} in ${window}`
	if (where != "all names") line += ` on ${where}`
	line += "."
	if (core.truncated) line += " List was capped."
	if (core.dropped) line += ` ${core.dropped} messages did not fit.`
	return line
}

export function jetStreamStatus(js?: JetStreamSnapshot): string {
	if (!js?.enabled) return "JetStream is off."
	if (js.error && (js.streams?.length ?? 0) == 0) {
		if (js.error == "not enabled on this server") {
			return "JetStream is not on this server. That store is optional. Core still works."
		}
		return `JetStream could not be read: ${js.error}.`
	}
	const names = js.streams?.reduce((sum, s) => sum + (s.subjects?.length ?? 0), 0) ?? 0
	const streams = js.streams?.length ?? 0
	let line = `JetStream is keeping ${names} name${names == 1 ? "" : "s"} in ${streams} stream${streams == 1 ? "" : "s"}.`
	if (js.failed) line += ` ${js.failed} stream${js.failed == 1 ? "" : "s"} could not be read.`
	if (js.truncated) line += " List was capped."
	return line
}

export function emptyCopy(snapshot: SubjectsSnapshot | null, search: string): string | null {
	if (!snapshot) return null
	const needle = search?.trim()
	const coreOn = !!snapshot.core?.enabled
	const jsOn = !!snapshot.jetstream?.enabled
	if (!coreOn && !jsOn) return "Turn on Core or JetStream to look."

	const coreNames = snapshot.core?.enabled ? (snapshot.core.subjects?.length ?? 0) : 0
	const jsNames = snapshot.jetstream?.enabled
		? snapshot.jetstream.streams?.reduce((sum, s) => sum + (s.subjects?.length ?? 0), 0) ?? 0
		: 0
	if (coreNames + jsNames > 0) {
		if (needle) return "No names match that search."
		return null
	}

	if (snapshot.jetstream?.enabled && snapshot.jetstream.error == "not enabled on this server" && coreOn) {
		return "JetStream is not on this server. Core heard nothing in this listen — it only sees messages while we look."
	}

	if (coreOn && jsOn) {
		return "Quiet right now. Core forgets anything that happened before we listened. JetStream has nothing stored yet. Publish a message or create a stream, then refresh."
	}
	if (coreOn) {
		return "Core heard nothing in this listen. It does not remember the past. Refresh to listen again, or turn on JetStream to see stored names."
	}
	return "No stored names. JetStream only lists subjects that still have messages in a stream."
}

export function firstListenCopy(listenMs: number): string {
	return `Listening for ${(listenMs / 1000).toFixed(1)}s. Core only sees messages that happen during this listen.`
}

export function leafTitle(path: string, heard?: number, streams?: { name: string, count: number }[]): string {
	const bits = [path]
	if (heard) bits.push(`heard ${heard} time${heard == 1 ? "" : "s"} just now`)
	for (const s of streams ?? []) {
		bits.push(`${s.count} stored in ${s.name}`)
	}
	return bits.join(" · ")
}
