/**
 * Blocks the agent from committing, pushing, or merging.
 *
 * Team rule (team-plan.md, AI usage policy): agents work on branches, a human
 * reads the diff and commits. This makes the rule a capability limit instead
 * of a prompt instruction. Applies to the bash tool only; commands the human
 * types with "!" go through user_bash and are never blocked.
 *
 * Allowed: status, diff, log, show, add, stash, checkout, switch, branch
 * creation, fetch, and everything else not listed below.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Each pattern tolerates global flags and -C <dir> between "git" and the
// subcommand, e.g. "git -C ../portal --no-pager commit".
const GIT = String.raw`\bgit\b(?:\s+(?:-[A-Za-z]|--[\w-]+)(?:[= ]\S+)?)*\s+`;

const blocked: Array<{ re: RegExp; what: string }> = [
	{ re: new RegExp(GIT + String.raw`commit\b`), what: "git commit" },
	{ re: new RegExp(GIT + String.raw`push\b`), what: "git push" },
	{ re: new RegExp(GIT + String.raw`merge\b`), what: "git merge" },
	{ re: new RegExp(GIT + String.raw`rebase\b`), what: "git rebase" },
	{ re: new RegExp(GIT + String.raw`cherry-pick\b`), what: "git cherry-pick" },
	{ re: new RegExp(GIT + String.raw`am\b`), what: "git am" },
	{ re: new RegExp(GIT + String.raw`reset\b.*--hard\b`), what: "git reset --hard" },
	{ re: /\bgh\s+pr\s+(merge|create)\b/, what: "gh pr merge/create" },
];

export default function (pi: ExtensionAPI) {
	let slopMode = false;

	pi.registerFlag("slop", {
		description: "Disable all git-guard protections for this run",
		type: "boolean",
		default: false,
	});

	function showState(ctx: ExtensionContext, warn: boolean): void {
		ctx.ui.setStatus("git-guard", slopMode ? ctx.ui.theme.fg("warning", "SLOP: git guard off") : undefined);
		const message = slopMode
			? "SLOP MODE ENABLED: all git-guard protections are disabled."
			: "Slop mode disabled. Git protections restored.";
		if (ctx.hasUI) {
			ctx.ui.notify(message, slopMode ? "warning" : "info");
		} else if (warn) {
			console.warn(message);
		}
	}

	pi.registerCommand("slop", {
		description: "Toggle git-guard protections (on, off, or status)",
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase();
			if (action === "status") {
				ctx.ui.notify(`Slop mode is ${slopMode ? "enabled" : "disabled"}.`, slopMode ? "warning" : "info");
				return;
			}
			if (action !== "" && action !== "on" && action !== "off") {
				ctx.ui.notify("Usage: /slop [on|off|status]", "error");
				return;
			}
			slopMode = action === "on" || (action === "" && !slopMode);
			showState(ctx, false);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		slopMode = pi.getFlag("slop") === true;
		showState(ctx, slopMode);
	});

	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "bash" || slopMode) return undefined;

		const command = String(event.input.command ?? "");
		const hit = blocked.find((b) => b.re.test(command));
		if (!hit) return undefined;

		const reason =
			`Blocked by git-guard: agents do not run "${hit.what}". ` +
			"Leave the change on the branch and hand back a diff summary; a human reviews and commits.";
		if (ctx.hasUI) ctx.ui.notify(`git-guard blocked: ${hit.what}`, "warning");
		return { block: true, reason };
	});
}
