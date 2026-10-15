import { n as foldTasks, t as changeSchema } from "./fold-DriVjcWm.js";
import { z } from "zod";
//#region lib/types/format.js
/** SEP durable extension validation and audited same-log coordinate remapping. */
const text = z.string().min(1).max(4096);
const recovery = z.strictObject({
	recoveryFromTaskId: text,
	recoveryPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
	recoveryRequestId: text,
	recoveryProjectId: z.uuid(),
	recoveryProjectGeneration: z.number().int().positive()
});
/** Admit identified SEP rows before general recoverable-tail handling.
* @param value - untrusted parsed physical row.
*/
function assertLocalRow(value) {
	if (typeof value === "object" && value !== null && "type" in value && (value.type === "task/checkpoint-change" || value.type === "recovery/continuation")) assertLocalEvent(value);
}
/** Validate only the two declared SEP events; requiredness is never downgraded.
* @param event - decoded durable event.
* @returns whether the event belongs to the SEP inventory.
*/
function assertLocalEvent(event) {
	if (event.type !== "task/checkpoint-change" && event.type !== "recovery/continuation") return false;
	if (Object.keys(event).some((key) => ![
		"type",
		"seq",
		"time",
		"data",
		"ignorable"
	].includes(key))) throw Error("LOCAL_SCHEMA: local extension must be log-only");
	if (!Number.isSafeInteger(event.seq) || event.seq < 0 || !Number.isSafeInteger(event.time)) throw Error("LOCAL_SCHEMA: invalid event coordinates");
	if (event.type === "recovery/continuation") {
		if (event["ignorable"] !== true) throw Error("LOCAL_SCHEMA: recovery linkage must remain ignorable");
		recovery.parse(event.data);
	} else {
		if (Object.hasOwn(event, "ignorable")) throw Error("TASK_SCHEMA: task changes must remain required");
		changeSchema.parse(event.data);
	}
	return true;
}
/** Validate task transitions at the durable artifact boundary without dispatching operations.
* @param artifact - detached decoded source or target.
*/
function validateLocalArtifact(artifact) {
	for (const event of artifact.events) assertLocalEvent(event);
	foldTasks(artifact.events, Number.MAX_SAFE_INTEGER);
}
/** Rebase the classified operation intent while preserving scope and effect state.
* @param event - validated source event.
* @param earlier - lookup that refuses absent or forward source references.
* @param targetSeq - new event position.
* @returns a detached rebased event, or the unchanged event when no task coordinate exists.
*/
function remapLocalEvent(event, earlier, targetSeq) {
	if (event.type !== "task/checkpoint-change") return event;
	const change = changeSchema.parse(event.data);
	if (change.action !== "prepare" && change.action !== "settle") return event;
	const operation = change.operation, prepare = change.action === "prepare";
	if (operation.intentSeq > event.seq || !prepare && operation.intentSeq === event.seq) throw Error("TASK_SCHEMA: invalid operation intent reference");
	return {
		...event,
		data: {
			...change,
			operation: {
				...operation,
				intentSeq: prepare && operation.intentSeq === event.seq ? targetSeq : earlier(operation.intentSeq)
			}
		}
	};
}
//#endregion
export { assertLocalEvent, assertLocalRow, remapLocalEvent, validateLocalArtifact };
