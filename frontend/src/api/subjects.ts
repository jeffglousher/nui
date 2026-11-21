import ajax, { CallOptions } from "@/plugins/AjaxService"
import { CoreCatalog, JetStreamCatalog, OccupiedCatalog } from "@/types/Subject"

function discardSysQuery(noSysMessages: boolean): string {
	return `discard_sys=${noSysMessages ? "true" : "false"}`
}

async function jetstream(cnnId: string, noSysMessages: boolean, opt?: CallOptions): Promise<JetStreamCatalog> {
	return ajax.get(`connection/${cnnId}/subjects/jetstream?${discardSysQuery(noSysMessages)}`, null, opt)
}

async function core(cnnId: string, filter: string, listenMs: number, noSysMessages: boolean, opt?: CallOptions): Promise<CoreCatalog> {
	const params = [
		`filter=${encodeURIComponent(filter)}`,
		`listen_ms=${listenMs}`,
		discardSysQuery(noSysMessages),
	].join("&")
	return ajax.get(`connection/${cnnId}/subjects/core?${params}`, null, opt)
}

async function occupied(cnnId: string, stream: string, filter: string | undefined, noSysMessages: boolean, opt?: CallOptions): Promise<OccupiedCatalog> {
	const params = [discardSysQuery(noSysMessages)]
	if (filter) params.push(`filter=${encodeURIComponent(filter)}`)
	return ajax.get(`connection/${cnnId}/subjects/jetstream/${stream}/occupied?${params.join("&")}`, null, opt)
}

const api = { jetstream, core, occupied }
export default api
