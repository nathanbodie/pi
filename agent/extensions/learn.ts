import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const LEARN_PROMPT =
	"When the user asks how to solve a problem, do not also solve the nested problems within that problem for them, they need to run into that problem, so they can understand the reasoning for the resolution.";

/** Adds the learn skill's instruction to the system prompt while Learn mode is enabled. */
export default function learnModeExtension(pi: ExtensionAPI): void {
	let enabled = false;

	function updateStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus("learn-mode", enabled ? ctx.ui.theme.fg("accent", "learn") : undefined);
	}

	pi.registerCommand("learn", {
		description: "Toggle Learn mode (on, off, or status)",
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase();
			if (action === "status") {
				ctx.ui.notify(`Learn mode is ${enabled ? "on" : "off"}.`, "info");
				return;
			}
			if (action !== "" && action !== "on" && action !== "off") {
				ctx.ui.notify("Usage: /learn [on|off|status]", "error");
				return;
			}

			enabled = action === "on" || (action === "" && !enabled);
			updateStatus(ctx);
			ctx.ui.notify(`Learn mode ${enabled ? "enabled" : "disabled"}.`, "info");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		enabled = false;
		updateStatus(ctx);
	});

	pi.on("before_agent_start", (event) => {
		if (!enabled) return undefined;
		return { systemPrompt: `${event.systemPrompt}\n\n${LEARN_PROMPT}` };
	});
}
