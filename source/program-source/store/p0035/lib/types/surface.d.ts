/**
 * Surface layer on top of the session event log: an ordered view of events
 * that produce LLM messages. The append-only log remains the source of truth.
 *
 * Browser-safe: web clients consume this subpath export, so it must stay free
 * of `node:` imports (they break the vite bundle).
 *
 * @module @deepseek-ai/dsh-session/surface
 */
import type { Message } from '@deepseek-ai/dsh-llm';
import { SessionLogOffset, SessionSeq } from './types.ts';
import type { SessionEvent, SessionEventType, SurfaceEvent, SurfaceOp } from './types.ts';
/** Readonly history immediately before a message-projection event. */
export interface SessionMessageProjectionContext {
    /** Current message-producing event sequences in model-visible order. */
    nodes: readonly SessionSeq[];
    /** Contiguous event window; entries at or beyond the candidate seq are not committed inputs. */
    events: readonly SessionEvent[];
    /** Absolute sequence of the window's first event. */
    baseSeq: SessionLogOffset;
    /** Previously projected messages keyed by their original event sequences. */
    messages: ReadonlyMap<SessionSeq, Message>;
}
/** Pure interpretation of one plugin-owned event that changes existing message content. */
export interface SessionMessageProjection<T extends SessionEventType = SessionEventType> {
    /** Event interpreted by this definition; declare it with `@messageProjection` in SessionEventMap. */
    type: T;
    /**
     * Validate the complete durable decision before returning any updates. Preserve
     * message identities and publish immutable copies without mutating the input.
     * @param event - candidate event, not yet applied to the supplied history.
     * @param context - history preceding this decision.
     * @returns changed current messages keyed by their original sequences.
     * @throws when the durable decision cannot be applied to this history.
     */
    project(event: SessionEvent<T>, context: SessionMessageProjectionContext): ReadonlyMap<SessionSeq, Message>;
}
/**
 * Whether an event type can join the model-visible surface.
 * @param type - event type to test.
 * @returns true for one of the four message-producing event types.
 */
export declare function isSurfaceEligibleType(type: string): boolean;
/**
 * Narrow an event to a surface-eligible event carrying its required marker.
 * @param event - event to test.
 * @returns true when both the type and marker identify a surface event.
 */
export declare function isSurfaceEvent(event: SessionEvent): event is SurfaceEvent;
/**
 * Narrow an event to an append-origin surface event: one that entered the
 * surface at its own log position and was never itself a replacement copy.
 *
 * The model-visible surface deliberately shadows replaced ranges, so it is the
 * wrong source for a human transcript — a landed replacement would erase
 * conversation the user already saw. Append-origin events are that transcript's
 * durable source material; replacement copies stay model-only.
 * @param event - event to test.
 * @returns true when the event appended to the surface tail.
 */
export declare function isAppendSurfaceEvent(event: SessionEvent): event is SurfaceEvent & {
    surfaceOp: 'append';
};
/**
 * Narrow an event to a surface replacement: a node that shadowed an existing
 * surface range instead of appending to the tail. The counterpart of
 * {@link isAppendSurfaceEvent} over the two {@link SurfaceOp} variants.
 * @param event - event to test.
 * @returns true when the event replaced a surface range.
 */
export declare function isReplacementSurfaceEvent(event: SessionEvent): event is SurfaceEvent & {
    surfaceOp: Extract<SurfaceOp, {
        op: 'replace';
    }>;
};
/**
 * Project a single event into the LLM message it derives to, or null when it
 * produces none — a non-surface event (attempt, boundary, log-only record) or an
 * empty-content assistant/message (which exists only to host usage). A caller
 * reconstructing model input supplies the same prefix's `projectedMessages`
 * from {@link foldSurface}; without that map this function reads original
 * event content. Session instance methods apply the live projection. Messages
 * are immutable and unchanged content retains its durable identity.
 * @param event - the event to project.
 * @param projectedMessages - message projections from the same log prefix's surface fold.
 * @returns the derived message, or null when the event produces none.
 */
export declare function deriveEventMessage(event: SessionEvent, projectedMessages?: ReadonlyMap<SessionSeq, Message>): Message | null;
/**
 * Reject noncanonical request-header fields and contradictory tool failure metadata.
 * This does not validate complete event payloads or embedded provider streams.
 * @param event - event whose locally related payload fields are inspected.
 * @param subject - event location to include in validation errors.
 * @throws when request data/header is not an object, optional header fields are empty, or tool failure metadata contradicts its message.
 */
export declare function validateSessionEventData(event: Pick<SessionEvent, 'type' | 'data'>, subject: string): void;
/** One replacement operation observed while folding a session surface. */
export interface SurfaceFoldReplacement {
    /** Seq of the event that replaced the prior surface range. */
    seq: SessionSeq;
    /** Declared inclusive start seq of the replaced surface range. */
    start: SessionSeq;
    /** Declared inclusive end seq of the replaced surface range. */
    end: SessionSeq;
    /** Actual surface entries removed by the operation, in surface order. */
    shadowedSeqs: SessionSeq[];
}
/** Complete result of replaying the surface operations in a session log. */
export interface SurfaceFoldResult {
    /** Current surface event sequences in model-visible order. */
    nodes: SessionSeq[];
    /** Replacement operations in event order. */
    replacements: SurfaceFoldReplacement[];
    /** Immutable projected messages, keyed by their original event sequences. */
    projectedMessages: ReadonlyMap<SessionSeq, Message>;
}
/** Readonly live projection of the message-producing session events. */
export interface SessionSurface {
    /** Current surface event sequences in model-visible order. */
    readonly nodes: readonly SessionSeq[];
    /** Monotonic count of committed positional replacements. */
    readonly replaceGeneration: number;
    /** Monotonic count of committed replacements and plugin-owned message changes. */
    readonly contentGeneration: number;
}
/**
 * Validate one event's surface metadata without checking membership in a log or surface.
 * @param event - event whose marker and source sequence values are inspected.
 * Unknown ignorable records retain opaque metadata and never change the surface.
 * @returns the validated operation, or undefined for a log-only or unknown ignorable event.
 * @throws when metadata violates event-local eligibility, marker, or source-sequence rules.
 */
export declare function validateSurfaceMetadata(event: SessionEvent): SurfaceOp | undefined;
/**
 * Replay a complete session log through the canonical surface fold.
 * @param events - session events in contiguous seq order.
 * @param projections - pure interpreters for plugin-owned message changes; required definitions must be supplied.
 * @returns detached current sequences and replacement history.
 * @throws when an interpreter is missing or an event violates its projection, surface metadata, source attribution, or replacement rules.
 */
export declare function foldSurface(events: readonly SessionEvent[], projections?: readonly SessionMessageProjection[]): SurfaceFoldResult;
/** Incremental ordered surface view and append-boundary validator. */
export declare class SurfaceManager implements SessionSurface {
    private log;
    private readonly baseSeq;
    private readonly projections;
    /** Shared transition state; replacement history is not retained. */
    private _state;
    /** Last processed absolute seq. */
    private _lastProcessedSeq;
    /** Candidate already validated by `validateNext`, pending exact log admission. */
    private _pendingPlan;
    /**
     * @param log - Contiguous complete log or loaded event window.
     * @param baseSeq - Absolute sequence of the window's first event.
     * @param projections - live borrowed definitions; removing a used definition invalidates further reads.
     */
    constructor(log: readonly SessionEvent[], baseSeq?: SessionLogOffset, projections?: readonly SessionMessageProjection[]);
    /**
     * Validate the next candidate without mutating the committed surface.
     * @param event - candidate event that has not entered the log yet.
     */
    validateNext(event: SessionEvent): void;
    /** Monotonic count of folded positional replacements. */
    get replaceGeneration(): number;
    /** Monotonic count of committed changes to existing model-visible content. */
    get contentGeneration(): number;
    /**
     * Project one message with every committed message projection applied.
     * @param event - message-producing or log-only event.
     * @returns its immutable projected message, or null when it produces none.
     */
    deriveEventMessage(event: SessionEvent): Message | null;
    /** Surface event sequences in model-visible order. */
    get nodes(): readonly SessionSeq[];
    /** Fold events appended since the previous access. */
    private _processDelta;
    /** Cached messages cannot outlive the definitions that interpreted their log. */
    private _assertProjections;
}
