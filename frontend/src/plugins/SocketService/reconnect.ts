import { logLimit } from "@/stores/log/limit"
import { MESSAGE_TYPE } from "@/stores/log/utils"
import logSo from "@/stores/log/index.js"
import { SocketService } from "."


export interface ReconnectOptions {
	delay?: number,
	tryMax?: number,
	maxDelay?: number,
}

const optionsDefault = {
	delay: 3000,
	tryMax: 3,
	maxDelay: 30000,
}

/**
 * se non è connesso allora prova a riconnettersi
 */
export class Reconnect {

	options: ReconnectOptions = null
	server: SocketService = null
	try = 0 //numero di tentativi
	idTimer = null
	enabled = true

	constructor(server: SocketService, options: ReconnectOptions = optionsDefault) {
		this.options = { ...optionsDefault, ...options }
		this.server = server
	}

	start() {
		if ( !this.enabled ) return
		this.stop()
		this.tryUp()
		const shift = Math.min(Math.max(this.try - 1, 0), 4)
		const delay = Math.min(
			(this.options.delay ?? 3000) * Math.pow(2, shift),
			this.options.maxDelay ?? 30000,
		)
		const maxDelay = this.options.maxDelay ?? 30000
		if (this.try === 1) {
			logSo.add({
				type: MESSAGE_TYPE.WARNING,
				title: "WS RECONNECT",
				body: `websocket closed; retrying in ${delay / 1000}s`,
			})
		} else if (this.try === (this.options.tryMax ?? 3) || delay >= maxDelay) {
			logLimit(`ws-reconnect-${this.server.cnnId ?? "nui"}`, "WS RECONNECT",
				`still disconnected after ${this.try} attempts; retrying every ${delay / 1000}s`,
				30_000)
		}
		this.idTimer = setTimeout(() => this.server.connect(), delay)
	}

	stop() {
		if (!this.idTimer) return
		clearTimeout(this.idTimer)
		this.idTimer = null
	}

	/** aumenta il numero di tentativi senza successo */
	tryUp() {
		this.try++
		console.debug(`socket:reconnect:try:${this.try}`)
		if (this.try == 1) return // primo tentativo non è un problema
		if (this.try == this.options.tryMax) {
			console.debug("socket:reconnect:max_try")
		}
	}

	/** azzera il numero di tentativi fatti */
	tryZero() {
		this.try = 0
	}

}