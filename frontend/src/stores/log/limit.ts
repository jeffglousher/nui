import { limitLogDue } from "@/utils/limitLog"
import logSo from "./index"
import { MESSAGE_TYPE } from "./utils"

/** first hit, then at most once per 10s so a flood cannot fill the LOG card */
export const LIMIT_LOG_INTERVAL_MS = 10_000

export function logLimit(key: string, title: string, body: string, intervalMs = LIMIT_LOG_INTERVAL_MS) {
	if (!limitLogDue(key, intervalMs)) return
	logSo.add({
		type: MESSAGE_TYPE.WARNING,
		title,
		body,
	})
}
