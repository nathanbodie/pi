import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const successfulStopReasons = new Set(["stop", "length", "toolUse"]);

function modelKey(provider: string, model: string): string {
	return `${provider}/${model}`;
}

function formatTokens(tokens: number): string {
	if (tokens < 1_000) return String(tokens);
	if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return `${(tokens / 1_000_000).toFixed(1)}m`;
}

/** Warns when an established prompt cache returns no cached tokens. */
export default function cacheMissWarning(pi: ExtensionAPI): void {
	const seenRequests = new Set<string>();
	const cacheObserved = new Set<string>();

	pi.on("session_start", (_event, ctx) => {
		seenRequests.clear();
		cacheObserved.clear();

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "message" || entry.message.role !== "assistant") continue;

			const message = entry.message;
			const key = modelKey(message.provider, message.model);
			seenRequests.add(key);
			if (message.usage.cacheRead > 0 || message.usage.cacheWrite > 0) {
				cacheObserved.add(key);
			}
		}
	});

	pi.on("message_end", (event, ctx) => {
		if (event.message.role !== "assistant") return;

		const message = event.message;
		const key = modelKey(message.provider, message.model);
		const model = ctx.modelRegistry.find(message.provider, message.model);
		const modelAdvertisesCaching = (model?.cost.cacheRead ?? 0) > 0 || (model?.cost.cacheWrite ?? 0) > 0;
		const cacheWasExpected = cacheObserved.has(key) || (seenRequests.has(key) && modelAdvertisesCaching);
		const uncachedTokens = message.usage.input + message.usage.cacheWrite;

		if (
			cacheWasExpected &&
			message.usage.cacheRead === 0 &&
			uncachedTokens > 0 &&
			successfulStopReasons.has(message.stopReason)
		) {
			ctx.ui.notify(
				`Cache miss: ${key} reingested ${formatTokens(uncachedTokens)} context tokens.`,
				"warning",
			);
		}

		seenRequests.add(key);
		if (message.usage.cacheRead > 0 || message.usage.cacheWrite > 0) {
			cacheObserved.add(key);
		}
	});
}
