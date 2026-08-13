import subjectsApi from "@/api/subjects"
import cnnSo from "@/stores/connections"
import { buildMessageDetail } from "@/stores/docs/utils/factory"
import viewSetup, { ViewStore } from "@/stores/stacks/viewBase"
import { DOC_TYPE } from "@/types"
import { OccupiedCatalog, SubjectHit, CoreCatalog, JetStreamCatalog } from "@/types/Subject"
import { MSG_FORMAT } from "@/utils/editor"
import { canListen } from "@/utils/subjects/filter"
import { shouldFetchCore, shouldFetchJetStream, DiscoverReason } from "@/utils/subjects/fetch"
import { mixStores } from "@priolo/jon"
import loadBaseSetup, { LoadBaseState, LoadBaseStore } from "../../loadBase"
import { MessageStore } from "../../message"
import { ViewState } from "../../viewBase"

const setup = {

	state: {
		connectionId: <string>null,

		coreEnabled: true,
		jetstreamEnabled: true,
		filter: "",
		listenMs: 2000,

		core: <CoreCatalog>null,
		jetstream: <JetStreamCatalog>null,
		occupied: <Record<string, OccupiedCatalog>>{},
		occupiedLoading: <string>null,

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
			state.filter = data.filter ?? ""
			state.listenMs = data.listenMs ?? 2000
			state.textSearch = data.textSearch
			state.format = data.format
		},

		async fetch(_: void, store?: LoadBaseStore) {
			const s = <SubjectsStore>store
			await s.discover("refresh")
			await loadBaseSetup.actions.fetch(_, store)
		},

		async fetchIfVoid(_: void, store?: SubjectsStore) {
			await store.discover("open")
		},

		async discover(reason: DiscoverReason, store?: SubjectsStore) {
			if (shouldFetchJetStream(store.state.jetstreamEnabled, !!store.state.jetstream, reason)) {
				await store.fetchJetStream()
			}
			if (shouldFetchCore(store.state.coreEnabled, store.state.filter, !!store.state.core, reason)) {
				await store.fetchCore()
			}
		},

		async fetchJetStream(_: void, store?: SubjectsStore) {
			const catalog = await subjectsApi.jetstream(store.state.connectionId, { store, manageAbort: true, noError: true })
			if (!catalog || !Array.isArray(catalog.streams)) {
				store.setJetstream({ streams: [], error: catalog?.error || "could not be read" })
				return
			}
			store.setJetstream(catalog)
		},

		async fetchCore(_: void, store?: SubjectsStore) {
			if (!canListen(store.state.filter)) return
			const catalog = await subjectsApi.core(store.state.connectionId, store.state.filter.trim(), store.state.listenMs, { store, manageAbort: true, noError: true })
			if (!catalog || !Array.isArray(catalog.subjects)) {
				store.setCore({
					filter: store.state.filter.trim(),
					listenMs: store.state.listenMs,
					heard: 0,
					truncated: false,
					subjects: [],
					error: catalog?.error || "could not listen",
				})
				return
			}
			store.setCore(catalog)
		},

		async toggleCore(_: void, store?: SubjectsStore) {
			const next = !store.state.coreEnabled
			store.setCoreEnabled(next)
			if (next) await store.discover("toggle")
		},

		async toggleJetStream(_: void, store?: SubjectsStore) {
			const next = !store.state.jetstreamEnabled
			store.setJetstreamEnabled(next)
			if (next) await store.discover("toggle")
		},

		async listenNow(_: void, store?: SubjectsStore) {
			if (!canListen(store.state.filter)) return
			await store.fetchCore()
		},

		async loadOccupied(hit: SubjectHit, store?: SubjectsStore) {
			const stream = hit.streams[0]
			if (!stream) return
			const pattern = stream.pattern || ">"
			const key = `${stream.name}::${pattern}`
			if (store.state.occupied[key] || store.state.occupiedLoading == key) return
			store.setOccupiedLoading(key)
			try {
				const catalog = await subjectsApi.occupied(store.state.connectionId, stream.name, pattern, { store, noError: true })
				store.setOccupied({ ...store.state.occupied, [key]: catalog })
			} finally {
				store.setOccupiedLoading(null)
			}
		},

		async openHit(hit: SubjectHit, store?: SubjectsStore) {
			store.setSelect(hit.subject)
			if (hit.expandable && hit.kind != "occupied") {
				await store.loadOccupied(hit)
				return
			}
			if (hit.kind != "occupied" && !hit.streams.some(s => s.count)) return
			const stream = hit.streams[0]
			if (!stream) return
			const message = await subjectsApi.last(store.state.connectionId, hit.subject, stream.name, { store })
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
		setFilter: (filter: string) => ({ filter }),
		setListenMs: (listenMs: number) => ({ listenMs }),
		setCore: (core: CoreCatalog) => ({ core }),
		setJetstream: (jetstream: JetStreamCatalog) => ({ jetstream }),
		setOccupied: (occupied: Record<string, OccupiedCatalog>) => ({ occupied }),
		setOccupiedLoading: (occupiedLoading: string) => ({ occupiedLoading }),
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
