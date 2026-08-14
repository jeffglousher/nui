import { Subscription } from "@/types"

export function watchFilter(node: {
	path: string
	remainder?: boolean
	hit?: { subject: string, kind?: string }
}): string | null {
	if (node.remainder) return null
	if (node.hit?.subject) {
		const name = node.hit.subject
		if (node.hit.kind == "kv" || node.hit.kind == "object") {
			return name.includes("*") || name.endsWith(">") ? name : `${name}.>`
		}
		return name
	}
	if (!node.path) return null
	return `${node.path}.>`
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
