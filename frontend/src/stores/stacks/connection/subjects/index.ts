import subjectsApi from "@/api/subjects"
import cnnSo from "@/stores/connections"
import { buildMessageDetail } from "@/stores/docs/utils/factory"
import viewSetup, { ViewStore } from "@/stores/stacks/viewBase"
import { DOC_TYPE } from "@/types"
import { Message } from "@/types/Message"
import { SubjectHit, SubjectsSnapshot } from "@/types/Subject"
import { MSG_FORMAT } from "@/utils/editor"
import { mixStores } from "@priolo/jon"
import loadBaseSetup, { LoadBaseState, LoadBaseStore } from "../../loadBase"
import { MessageStore } from "../../message"
import { ViewState } from "../../viewBase"

const setup = {

	state: {
		connectionId: <string>null,

		coreEnabled: true,
		jetstreamEnabled: true,
		discardSys: true,
		filter: ">",
		listenMs: 2000,

		snapshot: <SubjectsSnapshot>null,
		textSearch: <string>null,
		select: <string>null,

		format: MSG_FORMAT.JSON,

		width: 380,
		widthMax: 900,
	},

	getters: {
		getTitle: (_: void, store?: ViewStore) => "SUBJECTS",
		getSubTitle: (_: void, store?: ViewStore) => cnnSo.getById((<SubjectsStore>store).state.connectionId)?.name ?? "--",
		getSerialization: (_: void, store?: ViewStore) => {
			const state = store.state as SubjectsState
			return {
				...viewSetup.getters.getSerialization(null, store),
				connectionId: state.connectionId,
				coreEnabled: state.coreEnabled,
				jetstreamEnabled: state.jetstreamEnabled,
				filter: state.filter,
				listenMs: state.listenMs,
				textSearch: state.textSearch,
				format: state.format,
			}
		},
		getConnection: (_: void, store?: SubjectsStore) => cnnSo.getById(store.state.connectionId),
	},

	actions: {
		setSerialization: (data: any, store?: ViewStore) => {
			viewSetup.actions.setSerialization(data, store)
			const state = store.state as SubjectsState
			state.connectionId = data.connectionId
			state.coreEnabled = data.coreEnabled ?? true
			state.jetstreamEnabled = data.jetstreamEnabled ?? true
			state.filter = data.filter ?? ">"
			state.listenMs = data.listenMs ?? 2000
			state.textSearch = data.textSearch
			state.format = data.format
		},

		async fetch(_: void, store?: LoadBaseStore) {
			const s = <SubjectsStore>store
			const snapshot = await subjectsApi.snapshot(s.state.connectionId, {
				core: s.state.coreEnabled,
				jetstream: s.state.jetstreamEnabled,
				listenMs: s.state.listenMs,
				filter: s.state.filter?.trim() || ">",
				discardSys: s.state.discardSys,
			}, { store, manageAbort: true })
			s.setSnapshot(snapshot)
			await loadBaseSetup.actions.fetch(_, store)
		},

		async fetchIfVoid(_: void, store?: SubjectsStore) {
			if (!!store.state.snapshot) return
			await store.fetch()
		},

		async toggleCore(_: void, store?: SubjectsStore) {
			store.setCoreEnabled(!store.state.coreEnabled)
			await store.fetch()
		},

		async toggleJetStream(_: void, store?: SubjectsStore) {
			store.setJetstreamEnabled(!store.state.jetstreamEnabled)
			await store.fetch()
		},

		async openHit(hit: SubjectHit, store?: SubjectsStore) {
			store.setSelect(hit.subject)
			let message: Message = null
			if (hit.core?.lastPayload != null) {
				message = {
					subject: hit.subject,
					payload: hit.core.lastPayload,
					headers: hit.core.headers,
					receivedAt: hit.core.lastAt ? Date.parse(hit.core.lastAt) : Date.now(),
				}
			} else if (hit.streams.length > 0) {
				const stream = hit.streams[0].name
				message = await subjectsApi.last(store.state.connectionId, hit.subject, stream, { store })
			}
			if (!message) return

			const storeMsg = store.state.linked as MessageStore
			if (storeMsg?.state.type == DOC_TYPE.MESSAGE) {
				if (storeMsg.state.message?.subject == message.subject && storeMsg.state.message?.payload == message.payload) {
					store.state.group.addLink({ view: null, parent: store, anim: true })
					store.setSelect(null)
				} else {
					storeMsg.setMessage(message)
				}
			} else {
				const view = buildMessageDetail(message, store.state.format, false)
				store.state.group.addLink({ view, parent: store, anim: true })
			}
			store._update()
		},
	},

	mutators: {
		setCoreEnabled: (coreEnabled: boolean) => ({ coreEnabled }),
		setJetstreamEnabled: (jetstreamEnabled: boolean) => ({ jetstreamEnabled }),
		setDiscardSys: (discardSys: boolean) => ({ discardSys }),
		setFilter: (filter: string) => ({ filter }),
		setListenMs: (listenMs: number) => ({ listenMs }),
		setSnapshot: (snapshot: SubjectsSnapshot) => ({ snapshot }),
		setTextSearch: (textSearch: string) => ({ textSearch }),
		setSelect: (select: string) => ({ select }),
		setFormat: (format: MSG_FORMAT) => ({ format }),
	},
}

export type SubjectsState = typeof setup.state & ViewState & LoadBaseState
export type SubjectsGetters = typeof setup.getters
export type SubjectsActions = typeof setup.actions
export type SubjectsMutators = typeof setup.mutators
export interface SubjectsStore extends ViewStore, LoadBaseStore, SubjectsGetters, SubjectsActions, SubjectsMutators {
	state: SubjectsState
}
const subjectsSetup = mixStores(viewSetup, loadBaseSetup, setup)
export default subjectsSetup
