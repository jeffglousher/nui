import ajax, { CallOptions } from "@/plugins/AjaxService"
import { Message } from "@/types/Message"
import { SubjectsSnapshot } from "@/types/Subject"

export interface SubjectsQuery {
	core: boolean
	jetstream: boolean
	listenMs: number
	filter: string
	discardSys: boolean
}

function decodePayload(value?: string): string | undefined {
	if (!value) return value
	try {
		return atob(value)
	} catch {
		return value
	}
}

async function snapshot(cnnId: string, query: SubjectsQuery, opt?: CallOptions): Promise<SubjectsSnapshot> {
	const params = [
		`core=${query.core}`,
		`jetstream=${query.jetstream}`,
		`listen_ms=${query.listenMs}`,
		`filter=${encodeURIComponent(query.filter || ">")}`,
		`discard_sys=${query.discardSys}`,
	].join("&")
	const data: SubjectsSnapshot = await ajax.get(`connection/${cnnId}/subjects?${params}`, null, opt)
	if (data?.core?.subjects) {
		data.core.subjects = data.core.subjects.map(s => ({
			...s,
			lastPayload: decodePayload(s.lastPayload),
		}))
	}
	return data
}

async function last(cnnId: string, subject: string, stream: string, opt?: CallOptions): Promise<Message> {
	const message: Message = await ajax.get(
		`connection/${cnnId}/subjects/last?subject=${encodeURIComponent(subject)}&stream=${encodeURIComponent(stream)}`,
		null,
		opt,
	)
	if (message?.payload) message.payload = decodePayload(message.payload)
	return message
}

const api = { snapshot, last }
export default api
