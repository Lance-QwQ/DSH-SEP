import { n as foldTasks } from "./fold-DriVjcWm.js";
//#region lib/types/invariant.js
/** Cordis companion name. */
const name = "task-checkpoint-invariant";
/** Invariant registry dependency. */
const inject = ["invariants"];
const install = Object.assign((ctx, fail) => {
	const check = (session) => {
		try {
			foldTasks(session.snapshotEvents(), 16 * 1024 * 1024);
		} catch (error) {
			fail(`required task stream is invalid: ${String(error)}`);
		}
	};
	for (const session of ctx.sessions.list()) check(session);
	ctx.on("session/created", check, { global: true });
	ctx.on("session/event", (session, event) => {
		if (event.type === "task/checkpoint-change") check(session);
	}, { global: true });
}, { inject: ["sessions"] });
/** Register strict revision, identity and permanent-cancellation checks.
* @param ctx - context carrying the invariant registry.
* @returns the companion registration disposer.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register("@deepseek-ai/dsh-task-checkpoint", install));
//#endregion
export { apply, inject, name };
