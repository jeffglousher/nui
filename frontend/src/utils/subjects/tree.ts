import { SubjectHit, SubjectNode, SubjectsSnapshot } from "@/types/Subject"

export function flattenHits(snapshot: SubjectsSnapshot | null): SubjectHit[] {
	if (!snapshot) return []
	const bySubject = new Map<string, SubjectHit>()

	const ensure = (subject: string): SubjectHit => {
		let hit = bySubject.get(subject)
		if (!hit) {
			hit = { subject, streams: [] }
			bySubject.set(subject, hit)
		}
		return hit
	}

	if (snapshot.core?.enabled) {
		for (const item of snapshot.core.subjects ?? []) {
			const hit = ensure(item.subject)
			hit.core = {
				count: item.count,
				lastPayload: item.lastPayload,
				lastAt: item.lastAt,
				headers: item.headers,
			}
		}
	}

	if (snapshot.jetstream?.enabled) {
		for (const stream of snapshot.jetstream.streams ?? []) {
			for (const item of stream.subjects ?? []) {
				const hit = ensure(item.subject)
				hit.streams.push({ name: stream.name, count: item.count })
			}
		}
	}

	return Array.from(bySubject.values()).sort((a, b) => a.subject.localeCompare(b.subject))
}

type Draft = {
	segment: string
	path: string
	children: Map<string, Draft>
	hit?: SubjectHit
}

export function buildSubjectTree(hits: SubjectHit[]): SubjectNode[] {
	const root: Draft = { segment: "", path: "", children: new Map() }
	for (const hit of hits) {
		const segments = hit.subject.split(".").filter(s => s.length > 0)
		if (segments.length == 0) continue
		let current = root
		let path = ""
		for (const segment of segments) {
			path = path.length == 0 ? segment : `${path}.${segment}`
			let child = current.children.get(segment)
			if (!child) {
				child = { segment, path, children: new Map() }
				current.children.set(segment, child)
			}
			current = child
		}
		current.hit = hit
	}
	return freeze(root).children
}

function freeze(draft: Draft): SubjectNode {
	const children = Array.from(draft.children.values())
		.sort((a, b) => a.segment.localeCompare(b.segment))
		.map(freeze)
	let names = draft.hit ? 1 : 0
	for (const child of children) names += child.names
	return {
		segment: draft.segment,
		path: draft.path,
		children,
		hit: draft.hit,
		names,
	}
}

export function filterTree(nodes: SubjectNode[], text: string): SubjectNode[] {
	const needle = text?.toLocaleLowerCase()?.trim()
	if (!needle) return nodes
	const keep = (node: SubjectNode): SubjectNode | null => {
		const children = node.children.map(keep).filter(Boolean) as SubjectNode[]
		const selfMatch = node.path.toLowerCase().includes(needle)
			|| node.hit?.streams.some(s => s.name.toLowerCase().includes(needle))
		if (!selfMatch && children.length == 0) return null
		let names = node.hit ? 1 : 0
		for (const child of children) names += child.names
		return { ...node, children, names }
	}
	return nodes.map(keep).filter(Boolean) as SubjectNode[]
}

export function countLeaves(nodes: SubjectNode[]): number {
	let n = 0
	for (const node of nodes) n += node.names
	return n
}
