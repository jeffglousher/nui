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

export function mergeWatch(subs: Subscription[] | null | undefined, subject: string): Subscription[] {
	const name = subject?.trim()
	if (!name) return [...(subs ?? [])]
	const list = (subs ?? []).map(s => ({ ...s }))
	const existing = list.find(s => s.subject == name)
	if (existing) {
		existing.disabled = false
		existing.favorite = true
		return list
	}
	return [...list, { subject: name, disabled: false, favorite: true }]
}
