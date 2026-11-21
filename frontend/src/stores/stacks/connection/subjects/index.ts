import subjectsApi from "@/api/subjects"
import streamsApi from "@/api/streams"
import cnnSo from "@/stores/connections"
import { buildStore } from "@/stores/docs/utils/factory"
import viewSetup, { ViewStore } from "@/stores/stacks/viewBase"
import { DOC_TYPE } from "@/types"
import { OccupiedCatalog, SubjectSource, CoreCatalog, JetStreamCatalog } from "@/types/Subject"
import { canListen, FILTER_EMPTY, normalizeListenFilter, validateListenFilter } from "@/utils/subjects/filter"
import { occupiedKey } from "@/utils/subjects/tree"
import { mixStores, StoreOf } from "@priolo/jon"
import loadBaseSetup, { LoadBaseStore } from "../../loadBase"
import type { MessagesStore } from "../messages"
import type { StreamMessagesStore } from "../../streams/messages"

const CORE_SAMPLE_MS = 2000

const setup = {

	state: {
		connectionId: <string>null,

		coreEnabled: true,
		jetstreamEnabled: true,
		noSysMessages: true,
		filtersOpen: false,
		filter: "",

		core: <CoreCatalog>null,
		jetstream: <JetStreamCatalog>null,
		occupied: <Record<string, OccupiedCatalog>>{},
		occupiedLoading: <Record<string, symbol>>{},
		listenHint: <string>null,
		coreSampling: false,
		coreAbort: <AbortController>null,
		catalogGen: 0,
		historyPending: false,
		historyRequest: <AbortController>null,

		textSearch: <string>null,
		select: <string>null,

		width: 350,
		widthMax: 800,
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
				noSysMessages: state.noSysMessages,
				filter: state.filter,
				textSearch: state.textSearch,
			}
		},
	},

	actions: {
		setSerialization: (data: any, store?: ViewStore) => {
			viewSetup.actions.setSerialization(data, store)
			const state = store.state as SubjectsState
			state.connectionId = data.connectionId
			state.coreEnabled = data.coreEnabled ?? true
			state.jetstreamEnabled = data.jetstreamEnabled ?? true
			state.noSysMessages = data.noSysMessages ?? true
			state.filter = data.filter ?? ""
			state.textSearch = data.textSearch
		},

		async fetch(_: void, store?: LoadBaseStore) {
			const s = <SubjectsStore>store
			if (s.state.jetstreamEnabled) await s.fetchJetStream()
			await loadBaseSetup.actions.fetch(_, store)
		},

		async fetchIfVoid(_: void, store?: SubjectsStore) {
			if (store.state.jetstreamEnabled && !store.state.jetstream) await store.fetchJetStream()
		},

		async fetchJetStream(_: void, store?: SubjectsStore) {
			const gen = ++store.state.catalogGen
			const catalog = await subjectsApi.jetstream(store.state.connectionId, store.state.noSysMessages, { store, manageAbort: true, noError: true })
			if (gen != store.state.catalogGen) return
			if (!Array.isArray(catalog?.streams)) {
				store.setJetstream({ streams: store.state.jetstream?.streams ?? [], error: catalog?.error || "could not be read" })
				return
			}
			const valid = new Set(catalog.streams.flatMap(s => s.subjects.map(item => occupiedKey(s.name, item.pattern))))
			store.setJetstream(catalog)
			store.setOccupied(Object.fromEntries(Object.entries(store.state.occupied).filter(([key]) => valid.has(key))))
			store.setOccupiedLoading(Object.fromEntries(Object.entries(store.state.occupiedLoading).filter(([key]) => valid.has(key))))
			const loaded = store.state.occupied
			for (const stream of catalog.streams) {
				for (const item of stream.subjects) {
					if (gen != store.state.catalogGen) return
					if (!loaded[occupiedKey(stream.name, item.pattern)]) continue
					await store.loadOccupied({ name: stream.name, pattern: item.pattern, refresh: true })
				}
			}
		},

		abortCore(_: void, store?: SubjectsStore) {
			store.state.coreAbort?.abort()
			store.state.coreAbort = null
			store.setCoreSampling(false)
		},

		async fetchCore(_: void, store?: SubjectsStore) {
			const filter = normalizeListenFilter(store.state.filter)
			if (!canListen(filter)) return
			if (store.state.filter != filter) store.setFilter(filter)
			store.abortCore()
			const ac = new AbortController()
			store.state.coreAbort = ac
			const prev = store.state.core
			if (!prev || prev.filter != filter) {
				store.setCore({
					filter,
					listenMs: CORE_SAMPLE_MS,
					heard: 0,
					truncated: false,
					subjects: [],
				})
			}
			store.setCoreSampling(true)
			try {
				const catalog = await subjectsApi.core(store.state.connectionId, filter, CORE_SAMPLE_MS, store.state.noSysMessages, {
					store, signal: ac.signal, noError: true, loading: false,
				})
				if (ac.signal.aborted) return
				store.setCore(Array.isArray(catalog?.subjects) ? catalog : {
					filter, listenMs: CORE_SAMPLE_MS, heard: 0, truncated: false,
					subjects: [], error: catalog?.error || "could not listen",
				})
			} finally {
				if (store.state.coreAbort === ac) {
					store.state.coreAbort = null
					store.setCoreSampling(false)
				}
			}
		},

		toggleCore(_: void, store?: SubjectsStore) {
			if (store.state.coreEnabled) store.abortCore()
			store.setCoreEnabled(!store.state.coreEnabled)
		},

		async toggleJetStream(_: void, store?: SubjectsStore) {
			const next = !store.state.jetstreamEnabled
			store.setJetstreamEnabled(next)
			if (next) await store.fetchIfVoid()
		},

		async toggleNoSysMessages(_: void, store?: SubjectsStore) {
			store.abortCore()
			store.setCore(null)
			store.setNoSysMessages(!store.state.noSysMessages)
			store.setOccupiedLoading({})
			if (store.state.jetstreamEnabled) await store.fetchJetStream()
			else store.setJetstream(null)
		},

		async sampleNow(_: void, store?: SubjectsStore) {
			const filter = normalizeListenFilter(store.state.filter)
			if (!filter) {
				store.setListenHint(FILTER_EMPTY)
				return
			}
			const problem = validateListenFilter(filter)
			if (problem) {
				store.setListenHint(problem)
				return
			}
			if (store.state.filter != filter) store.setFilter(filter)
			store.setListenHint(null)
			await store.fetchCore()
		},

		async loadOccupied(stream: Pick<SubjectSource, "name" | "pattern"> & { refresh?: boolean }, store?: SubjectsStore) {
			const pattern = stream.pattern || ">"
			const key = occupiedKey(stream.name, pattern)
			if ((!stream.refresh && store.state.occupied[key] && !store.state.occupied[key].error) || store.state.occupiedLoading[key]) return
			const request = Symbol()
			store.setOccupiedLoading({ ...store.state.occupiedLoading, [key]: request })
			try {
				const catalog = await subjectsApi.occupied(store.state.connectionId, stream.name, pattern, store.state.noSysMessages, {
					store, noError: true, loading: false,
				})
				if (store.state.occupiedLoading[key] != request) return
				if (!catalog || !Array.isArray(catalog.subjects)) {
					store.setOccupied({
						...store.state.occupied,
						[key]: { stream: stream.name, subjects: [], error: catalog?.error || "could not be read" },
					})
					return
				}
				store.setOccupied({ ...store.state.occupied, [key]: catalog })
			} finally {
				if (store.state.occupiedLoading[key] == request) {
					const loading = { ...store.state.occupiedLoading }
					delete loading[key]
					store.setOccupiedLoading(loading)
				}
			}
		},

		openLive(subject: string, store?: SubjectsStore) {
			if (!canListen(subject)) return
			const view = buildStore<MessagesStore>({
				type: DOC_TYPE.MESSAGES,
				connectionId: store.state.connectionId,
				subscriptions: [{ subject }],
				noSysMessages: store.state.noSysMessages,
			})
			const group = store.state.group
			group.add({ view, index: group.getIndexByView(store) + 1, anim: true })
		},

		async openHistory({ subject, streamName }: { subject: string, streamName: string }, store?: SubjectsStore) {
			if (!canListen(subject) || /[*,>]/.test(subject) || store.state.historyRequest) return
			const request = new AbortController()
			const connectionId = store.state.connectionId
			store.state.historyRequest = request
			store.setHistoryPending(true)
			try {
				const stream = await streamsApi.get(connectionId, streamName, { store, signal: request.signal, loading: false }, subject)
				if (!stream?.state || request.signal.aborted || store.state.select !== subject || !store.state.jetstreamEnabled) return
				const view = buildStore<StreamMessagesStore>({
					type: DOC_TYPE.STREAM_MESSAGES,
					connectionId,
					stream,
					filter: { subjects: [subject] },
				})
				const group = store.state.group
				group.add({ view, index: group.getIndexByView(store) + 1, anim: true })
			} finally {
				store.state.historyRequest = null
				store.setHistoryPending(false)
			}
		},

		disposeSubjects(_: void, store?: SubjectsStore) {
			store.state.catalogGen++
			store.setOccupiedLoading({})
			store.state.historyRequest?.abort()
			store.fetchAbort()
			store.abortCore()
		},
	},

	mutators: {
		setCoreEnabled: (coreEnabled: boolean) => ({ coreEnabled }),
		setJetstreamEnabled: (jetstreamEnabled: boolean) => ({ jetstreamEnabled }),
		setNoSysMessages: (noSysMessages: boolean) => ({ noSysMessages }),
		setFiltersOpen: (filtersOpen: boolean) => ({ filtersOpen }),
		setFilter: (filter: string) => ({ filter }),
		setCore: (core: CoreCatalog) => ({ core }),
		setJetstream: (jetstream: JetStreamCatalog) => ({ jetstream }),
		setOccupied: (occupied: Record<string, OccupiedCatalog>) => ({ occupied }),
		setOccupiedLoading: (occupiedLoading: Record<string, symbol>) => ({ occupiedLoading }),
		setListenHint: (listenHint: string) => ({ listenHint }),
		setCoreSampling: (coreSampling: boolean) => ({ coreSampling }),
		setTextSearch: (textSearch: string) => ({ textSearch }),
		setSelect: (select: string) => ({ select }),
		setHistoryPending: (historyPending: boolean) => ({ historyPending }),
	},
}

const subjectsSetup = mixStores(viewSetup, loadBaseSetup, setup)
export interface SubjectsStore extends StoreOf<typeof subjectsSetup> {}
export type SubjectsState = SubjectsStore["state"]
export default subjectsSetup
