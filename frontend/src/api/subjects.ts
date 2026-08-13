import ajax, { CallOptions } from "@/plugins/AjaxService"
import { Message } from "@/types/Message"
import { CoreCatalog, JetStreamCatalog, OccupiedCatalog } from "@/types/Subject"

function decodePayload(value?: string): string | undefined {
	if (!value) return value
	try {
		return atob(value)
	} catch {
		return value
	}
}

async function jetstream(cnnId: string, opt?: CallOptions): Promise<JetStreamCatalog> {
	return ajax.get(`connection/${cnnId}/subjects/jetstream`, null, opt)
}

async function core(cnnId: string, filter: string, listenMs: number, opt?: CallOptions): Promise<CoreCatalog> {
	const params = [
		`filter=${encodeURIComponent(filter)}`,
		`listen_ms=${listenMs}`,
	].join("&")
	return ajax.get(`connection/${cnnId}/subjects/core?${params}`, null, opt)
}

async function occupied(cnnId: string, stream: string, filter?: string, opt?: CallOptions): Promise<OccupiedCatalog> {
	const q = filter ? `?filter=${encodeURIComponent(filter)}` : ""
	return ajax.get(`connection/${cnnId}/subjects/jetstream/${encodeURIComponent(stream)}/occupied${q}`, null, opt)
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

const api = { jetstream, core, occupied, last }
export default api
