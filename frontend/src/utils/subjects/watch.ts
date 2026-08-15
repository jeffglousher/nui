import { Subscription } from "@/types"

export function hasWildcard(name: string): boolean {
	return !!name && (name.includes("*") || name.endsWith(">"))
}

function familyName(name: string): string {
	return hasWildcard(name) ? name : `${name}.>`
}

/** A ▸ door: KV, object store, or a capture that is actually a family. */
export function isFamilyCapture(kind?: string, pattern?: string): boolean {
	if (kind == "kv" || kind == "object") return true
	if (kind != "pattern") return false
	return hasWildcard(pattern || "")
}

/** Prefer the family a stream actually captures when several keepers share a row. */
export function preferredWatchPattern(streams?: { pattern?: string }[]): string | undefined {
	const patterns = (streams ?? []).map(s => s.pattern).filter((p): p is string => !!p)
	return patterns.find(hasWildcard) || patterns[0]
}

export function watchFilter(node: {
	path: string
	remainder?: boolean
	children?: unknown[]
	hit?: {
		subject: string
		kind?: string
		expandable?: boolean
		streams?: { pattern?: string }[]
	}
}): string | null {
	if (node.remainder) return null
	const pattern = preferredWatchPattern(node.hit?.streams)
	if (node.hit?.kind == "kv" || node.hit?.kind == "object") {
		const name = node.hit.subject
		if (!name) return null
		return familyName(name)
	}
	if (node.hit?.kind == "pattern") {
		if (pattern) return pattern
		const name = node.hit.subject
		if (!name) return null
		return familyName(name)
	}
	const folder = !!node.hit?.expandable || (node.children?.length ?? 0) > 0
	if (folder && node.hit?.kind != "occupied") {
		const name = node.hit?.subject || node.path
		if (!name) return null
		return familyName(name)
	}
	if (node.hit?.subject) return node.hit.subject
	if (!node.path) return null
	return familyName(node.path)
}

export function focusWatch(subs: Subscription[] | null | undefined, subject: string): Subscription[] {
	const name = subject?.trim()
	if (!name) return [...(subs ?? [])]
	const kept = (subs ?? [])
		.filter(s => !!s?.subject && (s.favorite || s.subject == name))
		.map(s => ({
			...s,
			disabled: s.subject != name,
		}))
	if (kept.some(s => s.subject == name)) return kept
	return [...kept, { subject: name, disabled: false, favorite: false }]
}
