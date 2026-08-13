import { canListen } from "./filter"

export type DiscoverReason = "open" | "toggle" | "refresh"

export function shouldFetchJetStream(enabled: boolean, hasCatalog: boolean, reason: DiscoverReason): boolean {
	if (!enabled) return false
	if (reason == "refresh") return true
	return !hasCatalog
}

export function shouldFetchCore(enabled: boolean, filter: string, hasCatalog: boolean, reason: DiscoverReason): boolean {
	if (!enabled) return false
	if (!canListen(filter)) return false
	if (reason == "refresh") return true
	return !hasCatalog
}
