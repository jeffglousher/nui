export interface CoreSubjectHit {
	subject: string
	count: number
	lastPayload?: string
	lastAt?: string
	headers?: { [key: string]: string[] }
}

export interface JetStreamSubjectHit {
	subject: string
	count: number
}

export interface JetStreamStreamHit {
	name: string
	subjects: JetStreamSubjectHit[]
}

export interface CoreSnapshot {
	enabled: boolean
	filter: string
	listenMs: number
	heard: number
	truncated: boolean
	dropped?: number
	error?: string
	subjects: CoreSubjectHit[]
}

export interface JetStreamSnapshot {
	enabled: boolean
	error?: string
	failed?: number
	truncated?: boolean
	streams: JetStreamStreamHit[]
}

export interface SubjectsSnapshot {
	capturedAt: string
	core: CoreSnapshot
	jetstream: JetStreamSnapshot
}

export interface SubjectHit {
	subject: string
	core?: { count: number, lastPayload?: string, lastAt?: string, headers?: { [key: string]: string[] } }
	streams: { name: string, count: number }[]
}

export interface SubjectNode {
	segment: string
	path: string
	children: SubjectNode[]
	hit?: SubjectHit
	names: number
}
