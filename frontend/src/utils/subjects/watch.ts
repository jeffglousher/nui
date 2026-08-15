import { Subscription } from "@/types"

function hasWildcard(name: string): boolean {
	return name.includes("*") || name.endsWith(">")
}

function familyName(name: string): string {
	return hasWildcard(name) ? name : `${name}.>`
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
	const pattern = node.hit?.streams?.find(s => s.pattern)?.pattern
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
