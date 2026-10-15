import type { SessionFormatArtifact, SessionFormatEvent } from '@deepseek-ai/dsh-session-format';
/** Admit identified SEP rows before general recoverable-tail handling.
 * @param value - untrusted parsed physical row.
 */
export declare function assertLocalRow(value: unknown): void;
/** Validate only the two declared SEP events; requiredness is never downgraded.
 * @param event - decoded durable event.
 * @returns whether the event belongs to the SEP inventory.
 */
export declare function assertLocalEvent(event: SessionFormatEvent): boolean;
/** Validate task transitions at the durable artifact boundary without dispatching operations.
 * @param artifact - detached decoded source or target.
 */
export declare function validateLocalArtifact(artifact: SessionFormatArtifact): void;
/** Rebase the classified operation intent while preserving scope and effect state.
 * @param event - validated source event.
 * @param earlier - lookup that refuses absent or forward source references.
 * @param targetSeq - new event position.
 * @returns a detached rebased event, or the unchanged event when no task coordinate exists.
 */
export declare function remapLocalEvent(event: SessionFormatEvent, earlier: (seq: number) => number, targetSeq: number): SessionFormatEvent;
//# sourceMappingURL=format.d.ts.map