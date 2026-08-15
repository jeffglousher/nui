import messagesApi from "@/api/messages"
import { socketPool } from "@/plugins/SocketService/pool"
import { MSG_TYPE, PayloadMessage } from "@/plugins/SocketService/types"
import cnnSo from "@/stores/connections"
import { buildMessageDetail } from "@/stores/docs/utils/factory"
import viewSetup, { ViewStore } from "@/stores/stacks/viewBase"
import { DOC_TYPE, Subscription } from "@/types"
import { MESSAGE_TYPE, Message } from "@/types/Message"
import { MSG_FORMAT } from "@/utils/editor"
import { throttle } from "@/utils/time"
import { LISTENER_CHANGE, mixStores } from "@priolo/jon"
import dayjs from "dayjs"
import { MessageStore } from "../../message"
import { ViewState } from "../../viewBase"
import { buildConnectionMessageSend } from "../utils/factory"
import { SS_EVENTS } from "@/plugins/SocketService"
import { appendMessages, recordStat } from "./retain"

export type { MessageStat } from "./retain"

const FLUSH_MS = 50

type pendingBuf = {
	messages: Message[]
	timer: ReturnType<typeof setTimeout> | null
}
const pendingByCard = new Map<string, pendingBuf>()

function pendingOf(store: MessagesStore): pendingBuf {
	const id = store.state.uuid
	let buf = pendingByCard.get(id)
	if (!buf) {
		buf = { messages: [], timer: null }
		pendingByCard.set(id, buf)
	}
	return buf
}

function dropPending(store: MessagesStore) {
	const buf = pendingByCard.get(store.state.uuid)
	if (!buf) return
	if (buf.timer) clearTimeout(buf.timer)
	buf.timer = null
	buf.messages = []
}

function flushMessages(store: MessagesStore) {
	const buf = pendingByCard.get(store.state.uuid)
	if (!buf) return
	buf.timer = null
	const batch = buf.messages
	buf.messages = []
	if (batch.length === 0) return
	const msgs = appendMessages(store.state.messages, batch)
	store.setMessages(msgs)
	const linked = store.state.linked as MessageStore
	if (!!linked && linked?.state.type == DOC_TYPE.MESSAGE && linked.state.linkToLast) {
		throttle(`msg-last-${store.state.uuid}`, () => {
			linked.setMessage(msgs[msgs.length - 1])
		}, 1000)
	}
}

const setup = {

	state: {
		/** CONNECTION d riferimento */
		connectionId: <string>null,

		/** SUBSCRIPTION sui quali rimanere in ascolto */
		subscriptions: <Subscription[]>null,
		/** DIALOG SUBSCRIPTION aperta */
		subscriptionsOpen: false,

		/** tutti i messaggi ricevuti */
		messages: <Message[]>[],
		//messages: <Message[]>historyTest,
		noSysMessages: true,

		/** contatore SUBJECTS ricevuti */
		stats: <{ [subjects: string]: MessageStat }>{},

		/** testo per la ricerca */
		textSearch: <string>null,

		/* per la dialog di FORMAT */
		format: MSG_FORMAT.JSON,
		formatsOpen: false,

		pause: false,

		//#region VIEWBASE
		//#endregion
	},

	getters: {
		getConnection: (_: void, store?: MessagesStore) => {
			return cnnSo.getById(store.state.connectionId)
		},
		getSocketServiceId: (_: void, store?: MessagesStore) => `msg::${store.state.uuid}`,
		getFiltered: (_: void, store?: MessagesStore) => {
			const text = store.state.textSearch?.toLocaleLowerCase()?.trim()
			if (!text || text.length == 0 || !store.state.messages) return store.state.messages
			return store.state.messages.filter(message =>
				!!message.type
				|| message.payload.toLowerCase().includes(text)
				|| message.subject.toLowerCase().includes(text)
			)
		},

		//#region VIEWBASE
		getTitle: (_: void, store?: ViewStore) => "MESSAGES",
		getSubTitle: (_: void, store?: ViewStore) => (<MessagesStore>store).getConnection()?.name ?? "--",
		getSerialization: (_: void, store?: ViewStore) => {
			const state = store.state as MessagesState
			return {
				...viewSetup.getters.getSerialization(null, store),
				connectionId: state.connectionId,
				subscriptions: state.subscriptions,
				textSearch: state.textSearch,
				format: state.format,
			}
		},
		//#endregion

	},

	actions: {

		async fetch(_: void, store?: MessagesStore) {
			const subscriptions = await messagesApi.subscriptionIndex(
				store.state.connectionId,
				{ store, manageAbort: true }
			)
			subscriptions.forEach(s => s.favorite = s.disabled = true)
			store.setSubscriptions(subscriptions)
		},
		async fetchIfVoid(_: void, store?: MessagesStore) {
			if (store.state.subscriptions == null) await store.fetch()
		},

		//#region VIEWBASE
		setSerialization: (data: any, store?: ViewStore) => {
			viewSetup.actions.setSerialization(data, store)
			const state = store.state as MessagesState
			state.connectionId = data.connectionId
			state.subscriptions = data.subscriptions
			state.textSearch = data.textSearch
			state.format = data.format
		},
		//#endregion


		async connect(_: void, store?: MessagesStore) {
			const ss = await socketPool.getOrCreate(store.getSocketServiceId(), store.state.connectionId)
			//ss.onOpen = () => store.sendSubscriptions()
			//ss.onMessage = message => store.addMessage(message)
			// remove existing handlers and adds the new one
			ss.emitter.off(MSG_TYPE.NATS_MESSAGE, null)
			ss.emitter.on(MSG_TYPE.NATS_MESSAGE, msg => {
				const payload = msg.payload as PayloadMessage
				store.addMessage({
					headers: payload.headers,
					subject: payload.subject,
					payload: atob(payload.payload),
				})
			})
			store.sendSubscriptions()
		},
		disconnect(_: void, store?: MessagesStore) {
			dropPending(store)
			pendingByCard.delete(store.state.uuid)
			socketPool.getById(store.getSocketServiceId())?.emitter.off(MSG_TYPE.NATS_MESSAGE, null)
			socketPool.destroy(store.getSocketServiceId())
		},

		/** empty the live tail without a late 50ms flush putting rows back */
		clearMessages(_: void, store?: MessagesStore) {
			dropPending(store)
			store.setMessages([])
		},

		/** aggiungo un messaggio di questa CARD */
		addMessage(msg: PayloadMessage, store?: MessagesStore) {

			// eventualmente scarta i messaggi di sistema
			if (store.state.noSysMessages && (msg.subject.startsWith("_INBOX") || msg.subject.startsWith("$"))) return

			const message: Message = {
				headers: msg.headers,
				subject: msg.subject,
				payload: msg.payload as string,
				receivedAt: Date.now(),
			}
			store.setStats(recordStat(store.state.stats, msg.subject, dayjs().valueOf()))

			const buf = pendingOf(store)
			buf.messages.push(message)
			if (!buf.timer) {
				buf.timer = setTimeout(() => flushMessages(store), FLUSH_MS)
			}
		},
		/** aggiorno i subjects di questo stack messages */
		sendSubscriptions: (_: void, store?: MessagesStore) => {
			flushMessages(store)
			// invio il cambio di subs al web-socket
			const subjWS = store.state.pause
				? []
				: store.state.subscriptions
					?.filter(s => !!s?.subject && !s.disabled)
					.map(s => s.subject) ?? []
			socketPool.getById(store.getSocketServiceId())?.sendSubjects(subjWS)

			// messaggio in lista di cambio subs
			const msgChangeSubj: Message = {
				type: subjWS.length > 0 ? MESSAGE_TYPE.INFO : MESSAGE_TYPE.WARN,
				subject: store.state.pause ? "IN PAUSE" : subjWS.length > 0 ? "LISTENING ON SUBJECTS" : "NO SUBJECTS",
				payload: subjWS.join(", "),
				receivedAt: Date.now(),
			}
			store.setMessages([...store.state.messages, msgChangeSubj])
		},
		/** invio al REST nel caso ci siano nuovi preferiti */
		updateSubscriptions: (_: void, store?: MessagesStore) => {
			const subjRest = store.state.subscriptions
				?.filter(s => !!s?.subject && s.favorite)
				.map(s => ({ subject: s.subject })) ?? []
			messagesApi.subscriptionUpdate(store.state.connectionId, subjRest)
		},

		/** apertura CARD MESSAGE-DETAIL */
		openMessageDetail(message: Message, store?: MessagesStore) {
			const storeMsg = (store.state.linked as MessageStore)

			// se è gia' aperto il dettaglio del messaggio 
			if (storeMsg?.state.type == DOC_TYPE.MESSAGE) {
				// se è uguale a quello precedente allora lo chiudo
				if (storeMsg.state.message == message) {
					store.state.group.addLink({ view: null, parent: store, anim: true })
				} else {
					const msgSo: MessageStore = store.state.linked as MessageStore
					msgSo.setMessage(message)
				}
			// se invece è chiuso...
			} else {
				const view = buildMessageDetail(message, store.state.format, storeMsg?.state.autoFormat ?? false)
				store.state.group.addLink({ view, parent: store, anim: true })
			}
			store._update()

			// tolgo l'aggancio all'ultimo messaggio
			if ( store.state.linked?.state.type == DOC_TYPE.MESSAGE ) {
				(<MessageStore>store.state.linked).state.linkToLast = false
			}
		},
		/** apertura CARD MESSAGE-SEND */
		openMessageSend(_: void, store?: MessagesStore) {
			const cnn = store.getConnection()
			if (!cnn) return
			store.state.group.addLink({
				view: buildConnectionMessageSend(
					cnn.id,
					store.state.subscriptions.map(s => s.subject)
				),
				parent: store,
				anim: true,
			})
		},
	},

	mutators: {
		setSubscriptions: (subscriptions: Subscription[]) => ({ subscriptions }),
		setMessages: (messages: Message[]) => ({ messages }),
		setNoSysMessages: (noSysMessages: boolean) => ({ noSysMessages }),
		setSubscriptionsOpen: (subscriptionsOpen: boolean) => ({ subscriptionsOpen }),
		setTextSearch: (textSearch: string) => ({ textSearch }),
		setFormat: (format: MSG_FORMAT) => ({ format }),
		setFormatsOpen: (formatsOpen: boolean) => ({ formatsOpen }),
		setStats: (stats: { [subjects: string]: MessageStat }) => ({ stats }),
		setPause: (pause: boolean) => ({ pause }),
	},

	onListenerChange: async (store: MessagesStore, type: LISTENER_CHANGE) => {
		if (store._listeners.size == 1 && type == LISTENER_CHANGE.ADD) {
			store.connect()
		} else if (store._listeners.size == 0) {
			store.disconnect()
		}
	}
}

export type MessagesState = typeof setup.state & ViewState
export type MessagesGetters = typeof setup.getters
export type MessagesActions = typeof setup.actions
export type MessagesMutators = typeof setup.mutators
export interface MessagesStore extends ViewStore, MessagesGetters, MessagesActions, MessagesMutators {
	state: MessagesState
}
const msgSetup = mixStores(viewSetup, setup)
export default msgSetup


