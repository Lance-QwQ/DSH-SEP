// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/index.ts
import { Service } from "@deepseek-ai/cordis";
import { isAbsolute } from "node:path";
import { brandString as brandString3 } from "@deepseek-ai/dsh-brand";
import { assertNever, deepFreeze as deepFreeze2, snapshotJsonValue } from "@deepseek-ai/dsh-util-values";
import { scopeOf, scopeTarget } from "@deepseek-ai/dsh-scope";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/types.ts
import { brandNumber, brandString } from "@deepseek-ai/dsh-brand";
function SessionId(id) {
  return brandString(id);
}
function SessionSeq(value) {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new TypeError(`SessionSeq must be a non-negative safe integer, got ${String(value)}`);
  }
  return brandNumber(value);
}
function SessionLogOffset(value) {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new TypeError(`SessionLogOffset must be a non-negative safe integer, got ${String(value)}`);
  }
  return brandNumber(value);
}
var SESSION_FORMAT_VERSION = 3;

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/known-event-types.ts
var KNOWN_SESSION_EVENT_TYPES = /* @__PURE__ */ new Set([
  "agent-preset/selected",
  "agent/inbox/spliced",
  "approval/asked",
  "approval/decided",
  "approval/policy",
  "assistant/attempt",
  "assistant/message",
  "command/done",
  "command/run",
  "compaction/end",
  "compaction/prune",
  "compaction/start",
  "compaction/summary",
  "deliverables/presented",
  "feedback/message-delete",
  "feedback/message-put",
  "feedback/record",
  "goal/change",
  "hook/invoked",
  "hook/result",
  "image/offload",
  "llm/retry",
  "llm/retry-started",
  "model/selection",
  "permission/preset",
  "plan/mode",
  "request/context",
  "request/header",
  "sandbox/mode",
  "schedule/change",
  "session-log-deepseek/delivery-accepted",
  "session/end-seed",
  "session/title",
  "session/title-llm-request",
  "step/end",
  "step/start",
  "subagent/catalog",
  "subagent/descriptor",
  "subagent/model-selection-policy",
  "system/message",
  "task/checkpoint-change",
  "team/member",
  "team/message/delivered",
  "team/message/queued",
  "team/task",
  "todo/write",
  "tool-workflow/agent-end",
  "tool-workflow/agent-start",
  "tool-workflow/run-end",
  "tool-workflow/run-start",
  "tool/call",
  "tool/ptc-dispatch",
  "tool/ptc-dispatch-start",
  "tool/result",
  "turn/end",
  "turn/start",
  "user/message",
  "web/deepseek-search-llm-request",
  "workspace/changes"
]);
var MESSAGE_PROJECTION_EVENT_TYPES = /* @__PURE__ */ new Set([
  "image/offload"
]);

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/surface.ts
var SURFACE_EVENT_TYPES = /* @__PURE__ */ new Set([
  "system/message",
  "user/message",
  "assistant/message",
  "tool/result"
]);
function isSurfaceEligibleType(type) {
  return SURFACE_EVENT_TYPES.has(type);
}
function isSurfaceEvent(event) {
  if (!SURFACE_EVENT_TYPES.has(event.type)) return false;
  const candidate = event;
  return candidate.surfaceOp !== void 0;
}
function isAppendSurfaceEvent(event) {
  return isSurfaceEvent(event) && event.surfaceOp === "append";
}
function isReplacementSurfaceEvent(event) {
  return isSurfaceEvent(event) && event.surfaceOp !== "append";
}
function deriveEventMessage(event, projectedMessages) {
  const projected = projectedMessages?.get(event.seq);
  if (projected !== void 0) return projected;
  switch (event.type) {
    // Ordinary prompts and injected context project in user role: the event's
    // model-facing content stays verbatim. Do NOT re-add per-type framing
    // (e.g. `<context>`) here: framing is caller-owned — a producer bakes it
    // into `content`, as agent-instructions does with `<system-reminder>` — or,
    // if reintroduced, must be driven by the event `meta` map and a dedicated
    // renderer, keeping this projection a verbatim pass-through. See the
    // deferred design note in
    // ../../../../.agents/notes/implemented/simplification/2026-07-20-unwrap-injected-content-envelopes.md
    case "user/message": {
      return event.data;
    }
    // An empty-content message projects to no wire message. For
    // system/message the node records "no system prompt" while keeping its
    // surface position; for assistant/message the event exists only to host a
    // max-tokens step's usage and must not inject a content-less assistant
    // turn into the provider transcript.
    case "system/message":
    case "assistant/message": {
      if (event.data.message.content.length === 0) return null;
      return event.data.message;
    }
    case "tool/result": {
      return event.data.message;
    }
    default:
      return null;
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateSessionEventData(event, subject) {
  const data = event.data;
  if (event.type === "request/header") {
    if (!isRecord(data)) throw new Error(`${subject} data must be an object`);
    const header = data["header"];
    if (!isRecord(header)) throw new Error(`${subject} header must be an object`);
    if (Object.hasOwn(header, "system")) throw new Error(`${subject} must omit header.system; use system/message`);
    if (Array.isArray(header["tools"]) && header["tools"].length === 0) {
      throw new Error(`${subject} must omit empty tools`);
    }
    const defaults = header["adapterDefaults"];
    if (isRecord(defaults) && Object.keys(defaults).length === 0) {
      throw new Error(`${subject} must omit empty adapterDefaults`);
    }
  } else if (event.type === "tool/result") {
    if (!isRecord(data)) throw new Error(`${subject} data must be an object`);
    if (data["error"] === void 0) return;
    const message = data["message"];
    const content = isRecord(message) ? message["content"] : void 0;
    const block = Array.isArray(content) ? content[0] : void 0;
    if (!isRecord(block) || block["isError"] !== true) {
      throw new Error(`${subject} error requires message content[0].isError === true`);
    }
  }
}
function createFoldState() {
  return { nodes: [], replaceGeneration: 0, contentGeneration: 0, projectedMessages: /* @__PURE__ */ new Map(), projections: /* @__PURE__ */ new Set() };
}
function isEventSeq(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}
function isReplaceOp(value) {
  const op = value;
  return Object.keys(op).length === 3 && Object.hasOwn(op, "op") && Object.hasOwn(op, "startSeq") && Object.hasOwn(op, "endSeq") && op["op"] === "replace" && isEventSeq(op["startSeq"]) && isEventSeq(op["endSeq"]);
}
function surfaceOpOf(event) {
  const raw = event;
  if (!isSurfaceEligibleType(event.type)) {
    if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable === true) return;
    if (raw.surfaceOp !== void 0) {
      throw new Error(`session event "${event.type}" is not surface-eligible and cannot carry surfaceOp`);
    }
    if (raw.sourceEventSeqs !== void 0) {
      throw new Error(`session event "${event.type}" is not surface-eligible and cannot carry sourceEventSeqs`);
    }
    return;
  }
  const op = raw.surfaceOp;
  if (op === void 0) {
    throw new Error(`session event "${event.type}" is surface-eligible and requires a surfaceOp marker`);
  }
  if (op === "append") return op;
  if (op === null || typeof op !== "object" || Array.isArray(op)) {
    throw new Error(`session event "${event.type}" carries an invalid surfaceOp`);
  }
  if (!isReplaceOp(op)) {
    throw new Error(`session event "${event.type}" carries an invalid replace surfaceOp`);
  }
  return op;
}
function assertSourceEventReferences(event, shadowedSeqs) {
  const raw = event.sourceEventSeqs;
  if (event.type === "assistant/message" && raw !== void 0) {
    throw new Error("assistant/message embeds its source stream and cannot carry sourceEventSeqs");
  }
  const sources = /* @__PURE__ */ new Set();
  if (raw !== void 0) {
    if (!Array.isArray(raw)) {
      throw new Error(`sourceEventSeqs on event at seq ${event.seq} must be an array when present`);
    }
    if (raw.length === 0) {
      throw new Error("sourceEventSeqs must not be empty");
    }
    let nonEarlierSource;
    for (const source of raw) {
      if (!isEventSeq(source)) {
        throw new Error(`session event "${event.type}" sourceEventSeqs must densely contain non-negative safe integers`);
      }
      sources.add(source);
      if (nonEarlierSource === void 0 && source >= event.seq) nonEarlierSource = source;
    }
    if (sources.size !== raw.length) {
      throw new Error("sourceEventSeqs must not contain duplicates");
    }
    if (nonEarlierSource !== void 0) {
      throw new Error(`sourceEventSeqs must reference earlier events: ${nonEarlierSource} >= current seq ${event.seq}`);
    }
  }
  const missing = shadowedSeqs.filter((seq) => !sources.has(seq));
  if (missing.length > 0) {
    throw new Error(`surface replace: sourceEventSeqs must include every shadowed surface node; missing ${missing.join(", ")}`);
  }
}
function validateSurfaceMetadata(event) {
  const op = surfaceOpOf(event);
  if (op !== void 0 && op !== "append" && (op.startSeq >= event.seq || op.endSeq >= event.seq)) {
    throw new Error(`surface replace at seq ${event.seq}: startSeq and endSeq must reference earlier events`);
  }
  if (op !== void 0) assertSourceEventReferences(event, []);
  return op;
}
function replacementRange(state, op) {
  const startIdx = state.nodes.indexOf(op.startSeq);
  if (startIdx === -1) {
    throw new Error(`surface replace: start seq ${op.startSeq} not found in surface`);
  }
  const endIdx = state.nodes.indexOf(op.endSeq);
  if (endIdx === -1) {
    throw new Error(`surface replace: end seq ${op.endSeq} not found in surface`);
  }
  if (startIdx > endIdx) {
    throw new Error(`surface replace: start seq ${op.startSeq} (index ${startIdx}) is after end seq ${op.endSeq} (index ${endIdx})`);
  }
  return {
    startIdx,
    endIdx,
    shadowedSeqs: state.nodes.slice(startIdx, endIdx + 1)
  };
}
function isDeepEqualJson(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => isDeepEqualJson(item, b[i]));
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aKeys = Object.keys(a);
  const bRecord = b;
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => Object.hasOwn(b, key) && isDeepEqualJson(a[key], bRecord[key]));
}
function assertToolResultRewrite(event, shadowedSeqs, events, baseSeq) {
  if (event.type !== "tool/result") return;
  if (shadowedSeqs.length !== 1) {
    throw new Error("tool/result surface replacement must rewrite exactly one current node");
  }
  for (const originalSeq of shadowedSeqs) {
    const original = events[originalSeq - baseSeq];
    if (original?.type !== "tool/result") {
      throw new Error("tool/result surface replacement must target a current tool/result");
    }
    const originalRest = { ...original.data };
    const replacementRest = { ...event.data };
    const originalResult = original.data.message.content[0];
    const replacementResult = event.data.message.content[0];
    originalRest["message"] = {
      ...original.data.message,
      content: [{ ...originalResult, content: null }]
    };
    replacementRest["message"] = {
      ...event.data.message,
      content: [{ ...replacementResult, content: null }]
    };
    if (!isDeepEqualJson(originalRest, replacementRest)) {
      throw new Error("tool/result surface replacement may change only content");
    }
  }
}
function assertSystemHeadRewrite(event, state, startIdx, shadowedSeqs, events, baseSeq) {
  if (startIdx !== 0) return;
  const head = events[state.nodes[0] - baseSeq];
  if (head?.type !== "system/message") return;
  if (event.type !== "system/message" || shadowedSeqs.length !== 1) {
    throw new Error("surface replace: node 0 holds the system prompt and may be rewritten only by a system/message over exactly that node");
  }
}
function planSurfaceEvent(state, event, expectedSeq, events, baseSeq, projections) {
  if (event.seq !== expectedSeq) {
    throw new Error(`session event seq ${event.seq} is not contiguous; expected ${expectedSeq}`);
  }
  const surfaceOp = validateSurfaceMetadata(event);
  const projection = projections.find((item) => item.type === event.type);
  if (projection !== void 0) {
    return { kind: "project", projection, messages: projection.project(event, {
      nodes: state.nodes,
      events,
      baseSeq,
      messages: state.projectedMessages
    }) };
  }
  if (MESSAGE_PROJECTION_EVENT_TYPES.has(event.type)) {
    throw new Error(`session event "${event.type}" requires a message projection; load its owning plugin or supply its projection definition`);
  }
  if (surfaceOp === void 0) return;
  if (surfaceOp === "append") {
    return { kind: "append", seq: event.seq };
  }
  const range = replacementRange(state, surfaceOp);
  assertSourceEventReferences(event, range.shadowedSeqs);
  assertToolResultRewrite(event, range.shadowedSeqs, events, baseSeq);
  assertSystemHeadRewrite(event, state, range.startIdx, range.shadowedSeqs, events, baseSeq);
  return {
    kind: "replace",
    seq: event.seq,
    start: surfaceOp.startSeq,
    end: surfaceOp.endSeq,
    ...range
  };
}
function applySurfaceEvent(state, event, expectedSeq, events, baseSeq, projections) {
  const plan = planSurfaceEvent(state, event, expectedSeq, events, baseSeq, projections);
  return applySurfacePlan(state, plan);
}
function applySurfacePlan(state, plan) {
  if (plan?.kind === "append") {
    state.nodes.push(plan.seq);
  } else if (plan?.kind === "replace") {
    state.nodes.splice(plan.startIdx, plan.endIdx - plan.startIdx + 1, plan.seq);
    state.replaceGeneration += 1;
    state.contentGeneration += 1;
  } else if (plan?.kind === "project") {
    for (const [seq, message] of plan.messages) state.projectedMessages.set(seq, message);
    state.projections.add(plan.projection);
    state.contentGeneration += 1;
  }
  if (plan?.kind !== "replace") return;
  return {
    seq: plan.seq,
    start: plan.start,
    end: plan.end,
    shadowedSeqs: plan.shadowedSeqs
  };
}
function foldSurface(events, projections = []) {
  const state = createFoldState();
  const replacements = [];
  for (const [index, event] of events.entries()) {
    const replacement = applySurfaceEvent(
      state,
      event,
      SessionSeq(index),
      events,
      SessionLogOffset(0),
      projections
    );
    if (replacement !== void 0) replacements.push(replacement);
  }
  return { nodes: [...state.nodes], replacements, projectedMessages: new Map(state.projectedMessages) };
}
var SurfaceManager = class {
  /**
   * @param log - Contiguous complete log or loaded event window.
   * @param baseSeq - Absolute sequence of the window's first event.
   * @param projections - live borrowed definitions; removing a used definition invalidates further reads.
   */
  constructor(log, baseSeq = SessionLogOffset(0), projections = []) {
    this.log = log;
    this.baseSeq = baseSeq;
    this.projections = projections;
    this._lastProcessedSeq = baseSeq === 0 ? -1 : SessionSeq(baseSeq - 1);
  }
  log;
  baseSeq;
  projections;
  /** Shared transition state; replacement history is not retained. */
  _state = createFoldState();
  /** Last processed absolute seq. */
  _lastProcessedSeq;
  /** Candidate already validated by `validateNext`, pending exact log admission. */
  _pendingPlan;
  /**
   * Validate the next candidate without mutating the committed surface.
   * @param event - candidate event that has not entered the log yet.
   */
  validateNext(event) {
    this._assertProjections();
    if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1) this._processDelta();
    const expectedSeq = SessionSeq(this.baseSeq + this.log.length);
    this._pendingPlan = {
      event,
      expectedSeq,
      plan: planSurfaceEvent(this._state, event, expectedSeq, this.log, this.baseSeq, this.projections)
    };
  }
  /** Monotonic count of folded positional replacements. */
  get replaceGeneration() {
    this._assertProjections();
    if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1) this._processDelta();
    return this._state.replaceGeneration;
  }
  /** Monotonic count of committed changes to existing model-visible content. */
  get contentGeneration() {
    this._assertProjections();
    if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1) this._processDelta();
    return this._state.contentGeneration;
  }
  /**
   * Project one message with every committed message projection applied.
   * @param event - message-producing or log-only event.
   * @returns its immutable projected message, or null when it produces none.
   */
  deriveEventMessage(event) {
    this._assertProjections();
    if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1) this._processDelta();
    return deriveEventMessage(event, this._state.projectedMessages);
  }
  /** Surface event sequences in model-visible order. */
  get nodes() {
    this._assertProjections();
    if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1) this._processDelta();
    return this._state.nodes;
  }
  /** Fold events appended since the previous access. */
  _processDelta() {
    const tailSeq = this.baseSeq + this.log.length - 1;
    for (let seq = this._lastProcessedSeq + 1; seq <= tailSeq; seq++) {
      const index = seq - this.baseSeq;
      const event = this.log[index];
      const pending = this._pendingPlan;
      if (pending?.event === event && pending.expectedSeq === seq) {
        applySurfacePlan(this._state, pending.plan);
      } else {
        applySurfaceEvent(this._state, event, SessionSeq(seq), this.log, this.baseSeq, this.projections);
      }
      if (pending !== void 0 && pending.expectedSeq <= seq) this._pendingPlan = void 0;
      this._lastProcessedSeq = SessionSeq(seq);
    }
  }
  /** Cached messages cannot outlive the definitions that interpreted their log. */
  _assertProjections() {
    const candidate = this._pendingPlan;
    const pending = candidate !== void 0 && this.log[candidate.expectedSeq - this.baseSeq] === candidate.event ? candidate.plan : void 0;
    const required = pending?.kind === "project" ? [...this._state.projections, pending.projection] : this._state.projections;
    for (const projection of required) {
      if (!this.projections.includes(projection)) {
        throw new Error(`session message projection "${projection.type}" was removed or replaced; restore the session with its owning plugin`);
      }
    }
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/request-header.ts
import { callConfigEquals } from "@deepseek-ai/dsh-llm";
function canonicalHeader(header) {
  const adapterDefaults = header.adapterDefaults;
  return {
    config: header.config,
    ...adapterDefaults?.reasoningEffort === true || adapterDefaults?.maxTokens === true ? { adapterDefaults } : {},
    ...header.tools !== void 0 && header.tools.length > 0 ? { tools: header.tools } : {}
  };
}
function sameSchema(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function headerEquals(a, b) {
  if (!callConfigEquals(a.config, b.config) || a.adapterDefaults?.reasoningEffort !== b.adapterDefaults?.reasoningEffort || a.adapterDefaults?.maxTokens !== b.adapterDefaults?.maxTokens) return false;
  const at = a.tools ?? [];
  const bt = b.tools ?? [];
  return at.length === bt.length && at.every((tool, i) => sameSchema(tool, bt[i]));
}
function foldRequestHeader(events, from) {
  let state = from;
  for (const event of events) {
    if (event.type === "request/header") state = canonicalHeader(event.data.header);
  }
  return state;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/preparation.ts
var SessionPreparation = class _SessionPreparation {
  constructor(session, options) {
    this.options = options;
    this.session = session;
  }
  options;
  released = false;
  /** The exact Session to use for setup and publication. */
  session;
  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   */
  static create(session, options) {
    return new _SessionPreparation(session, options ?? {});
  }
  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose]() {
    if (this.released) return;
    this.released = true;
    this.options.release?.();
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/repair.ts
import { brandString as brandString2 } from "@deepseek-ai/dsh-brand";
import { deepFreeze } from "@deepseek-ai/dsh-util-values";
var TOOL_NOT_STARTED = "TOOL_NOT_STARTED";
var TOOL_OUTCOME_UNKNOWN = "TOOL_OUTCOME_UNKNOWN";
function interruptedTurnClosers(events) {
  let openTurn = null;
  let openStep = null;
  const pendingCalls = /* @__PURE__ */ new Map();
  for (const event of events) {
    switch (event.type) {
      case "turn/start":
        openTurn = event.data.turn;
        openStep = null;
        pendingCalls.clear();
        break;
      case "turn/end":
        openTurn = null;
        openStep = null;
        pendingCalls.clear();
        break;
      case "step/start":
        openStep = event.data.step;
        break;
      case "step/end":
        pendingCalls.clear();
        openStep = null;
        break;
      case "assistant/message":
        for (const block of event.data.message.content) {
          if (block.type === "tool-call") pendingCalls.set(block.id, { step: event.data.step });
        }
        break;
      case "tool/call":
        {
          const entry = pendingCalls.get(event.data.callId);
          if (entry) {
            entry.callSeq = event.seq;
          }
        }
        break;
      case "tool/result":
        pendingCalls.delete(event.data.message.source.callId);
        break;
      // Other event types do not move the turn/step boundary cursor.
      default:
        break;
    }
  }
  const last = events.at(-1);
  if (openTurn === null || last === void 0) return [];
  let seq = last.seq + 1;
  const time = last.time;
  const closers = [];
  for (const [callId, { step, callSeq }] of pendingCalls) {
    const started = callSeq !== void 0;
    const message = deepFreeze({
      id: brandString2(`interrupted-tool-result-${callId}-${seq}`),
      role: "user",
      source: { kind: "tool", callId },
      content: [{
        type: "tool-result",
        toolCallId: callId,
        isError: true,
        content: [{
          type: "text",
          text: started ? "The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly." : "The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed."
        }]
      }]
    });
    closers.push({
      type: "tool/result",
      seq: SessionSeq(seq++),
      time,
      data: {
        turn: openTurn,
        step,
        message,
        error: started ? { name: "ToolOutcomeUnknownError", code: TOOL_OUTCOME_UNKNOWN } : { name: "ToolNotStartedError", code: TOOL_NOT_STARTED }
      },
      surfaceOp: "append",
      ...started ? { sourceEventSeqs: [callSeq] } : {}
    });
  }
  if (openStep !== null) {
    closers.push({ type: "step/end", seq: SessionSeq(seq++), time, data: { turn: openTurn, step: openStep } });
  }
  closers.push({ type: "turn/end", seq: SessionSeq(seq++), time, data: { turn: openTurn, reason: { kind: "interrupted" } } });
  return closers;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/seq-ranges.ts
function isStrictlyIncreasing(values) {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}
function encodeSeqRanges(values) {
  if (!isStrictlyIncreasing(values)) return [...values];
  const encoded = [];
  for (let start = 0; start < values.length; ) {
    let end = start;
    while (end + 1 < values.length && values[end + 1] === values[end] + 1) end += 1;
    if (end - start >= 2) encoded.push([values[start], values[end]]);
    else for (let index = start; index <= end; index += 1) encoded.push(values[index]);
    start = end + 1;
  }
  return encoded;
}
function decodeSeqRanges(value, maxEntries = Number.MAX_SAFE_INTEGER) {
  if (!Array.isArray(value)) throw new TypeError("sourceEventSeqs must be an array");
  const decoded = [];
  let hasRange = false;
  for (const entry of value) {
    if (typeof entry === "number") {
      assertSeq(entry);
      if (decoded.length >= maxEntries) throw new TypeError("sourceEventSeqs exceeds its event sequence");
      decoded.push(SessionSeq(entry));
      continue;
    }
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new TypeError("sourceEventSeqs range entries must be [start, end] pairs");
    }
    const start = entry[0];
    const end = entry[1];
    assertSeq(start);
    assertSeq(end);
    if (end < start) throw new TypeError("sourceEventSeqs ranges require start <= end");
    const length = end - start + 1;
    if (length > maxEntries - decoded.length) {
      throw new TypeError("sourceEventSeqs range exceeds its event sequence");
    }
    for (let seq = start; seq <= end; seq += 1) decoded.push(SessionSeq(seq));
    hasRange = true;
  }
  if (hasRange && !isStrictlyIncreasing(decoded)) {
    throw new TypeError("sourceEventSeqs ranges must be strictly increasing");
  }
  return decoded;
}
function assertSeq(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("sourceEventSeqs must contain non-negative safe integers");
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/index.ts
function validateSessionHeader(id, input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("session header is not a plain JSON record");
  }
  const record = input;
  if (Object.hasOwn(record, "seedLength")) {
    throw new Error('session header has invalid field "seedLength"');
  }
  if (record.version !== SESSION_FORMAT_VERSION) {
    throw new Error(`session header version must be ${SESSION_FORMAT_VERSION}, got ${String(record.version)}`);
  }
  if (record.id !== id) {
    throw new Error(`session header id "${String(record.id)}" does not match session id "${id}"`);
  }
  if (typeof record.createdAt !== "number" || !Number.isSafeInteger(record.createdAt) || record.createdAt < 0) {
    throw new Error("session header createdAt must be a non-negative safe integer");
  }
  if (record.cwd !== void 0) {
    if (typeof record.cwd !== "string") throw new Error("session header cwd must be a string");
    if (!isAbsolute(record.cwd)) {
      throw new Error(`session header cwd must be an absolute path, got "${record.cwd}"`);
    }
  }
  if (record.parentSession !== void 0 && typeof record.parentSession !== "string") {
    throw new Error("session header parentSession must be a string");
  }
  if (typeof record.isSeeded !== "boolean") {
    throw new Error("session header isSeeded must be a boolean");
  }
  if (record.origin !== void 0 && record.origin !== "subagent") {
    throw new Error('session header origin must be "subagent"');
  }
  if (record.delegationDepth !== void 0 && (typeof record.delegationDepth !== "number" || !Number.isSafeInteger(record.delegationDepth) || record.delegationDepth < 0)) {
    throw new Error("session header delegationDepth must be a non-negative safe integer");
  }
  if (record.agentPreset !== void 0 && typeof record.agentPreset !== "string") {
    throw new Error("session header agentPreset must be a string");
  }
  return deepFreeze2(record);
}
function validateRestoredSessionHeader(id, input) {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const prototype = Reflect.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("session header is not a plain JSON record");
    }
  }
  return validateSessionHeader(id, input);
}
function snapshotSessionHeader(id, source) {
  const input = source === void 0 ? { version: SESSION_FORMAT_VERSION, id, createdAt: Date.now(), isSeeded: false } : source;
  const snapshot = snapshotJsonValue(input);
  if (snapshot === void 0) throw new Error("session header is not losslessly JSON-serializable");
  return validateSessionHeader(id, snapshot);
}
function adoptSessionEvent(event) {
  validateSessionEventData(event, `session event at seq ${event.seq}`);
  validateSurfaceMetadata(event);
  assertMessageEventShape(
    event,
    `session event at seq ${event.seq}`
  );
  switch (event.type) {
    case "user/message":
      deepFreeze2(event.data);
      break;
    case "system/message":
    case "assistant/message":
    case "tool/result":
      deepFreeze2(event.data.message);
      break;
    default:
      break;
  }
  return event;
}
function snapshotSessionEvent(event) {
  return adoptSessionEvent(structuredClone(event));
}
function assertSessionEventEnvelope(value, index) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`seed event at index ${index} has an invalid event envelope`);
  }
  const event = value;
  for (const key in event) {
    switch (key) {
      case "type":
      case "seq":
      case "time":
      case "data":
      case "surfaceOp":
      case "sourceEventSeqs":
      case "ignorable":
        break;
      default:
        throw new Error(`seed event at index ${index} has an invalid event envelope`);
    }
  }
  const type = event["type"];
  const seq = event["seq"];
  const time = event["time"];
  if (typeof type !== "string" || typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0 || Object.is(seq, -0) || typeof time !== "number" || !Number.isSafeInteger(time) || event["data"] === void 0 || event["ignorable"] !== void 0 && event["ignorable"] !== true) {
    throw new Error(`seed event at index ${index} has an invalid event envelope`);
  }
  validateSessionEventData(event, `seed ${type} at index ${index}`);
  switch (type) {
    case "request/header":
    case "system/message":
    case "user/message":
    case "assistant/attempt":
    case "assistant/message":
    case "tool/result":
      assertCurrentLlmShape(event, index);
      break;
  }
}
function assertCurrentLlmShape(event, index) {
  const data = event["data"];
  const record = typeof data === "object" && data !== null ? data : void 0;
  if (event["type"] === "request/header") {
    const headerRecord = record?.["header"];
    const config = headerRecord["config"];
    if (!hasProviderModel(config)) throw new Error(`seed request/header at index ${index} lacks provider/model`);
    const configRecord = config;
    const reasoningEffort = configRecord["reasoningEffort"];
    if (reasoningEffort !== void 0 && (typeof reasoningEffort !== "string" || reasoningEffort.length === 0)) {
      throw new Error(`seed request/header at index ${index} has an invalid reasoningEffort`);
    }
    assertAdapterDefaults(headerRecord["adapterDefaults"], configRecord, index);
    const reason = record?.["reason"];
    if (reason !== "initial" && reason !== "resume" && reason !== "change" && reason !== "series") {
      throw new Error(`seed request/header at index ${index} has an invalid reason`);
    }
    if (record?.["startsSeries"] !== void 0 && record["startsSeries"] !== true) {
      throw new Error(`seed request/header at index ${index} has an invalid startsSeries marker`);
    }
  }
  const type = event["type"];
  if (type === "assistant/attempt") {
    assertAssistantSettlementShape(record, type, index);
    return;
  }
  if (!isMessageEventType(type)) return;
  assertMessageEventShape(event, `seed ${type} at index ${index}`);
  if (type === "assistant/message") {
    assertAssistantSettlementShape(record, type, index);
  }
}
function assertAssistantSettlementShape(data, type, index) {
  const turn = data?.["turn"];
  const step = data?.["step"];
  if (typeof turn !== "number" || !Number.isSafeInteger(turn) || turn < 0 || Object.is(turn, -0) || typeof step !== "number" || !Number.isSafeInteger(step) || step < 0 || Object.is(step, -0) || !Array.isArray(data?.["stream"])) {
    throw new Error(`seed ${type} at index ${index} has invalid settlement fields`);
  }
}
var allowedAdapterKeys = /* @__PURE__ */ new Set(["reasoningEffort", "maxTokens"]);
function assertAdapterDefaults(value, config, index) {
  if (value === void 0) return;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`seed request/header at index ${index} has invalid adapterDefaults`);
  }
  const defaults = value;
  if (Object.keys(defaults).some((key) => !allowedAdapterKeys.has(key)) || Object.values(defaults).some((marker) => marker !== true) || defaults["reasoningEffort"] === true && config["reasoningEffort"] === void 0 || defaults["maxTokens"] === true && config["maxTokens"] === void 0) {
    throw new Error(`seed request/header at index ${index} has invalid adapterDefaults`);
  }
}
function isMessageEventType(type) {
  return type === "system/message" || type === "user/message" || type === "assistant/message" || type === "tool/result";
}
var MESSAGE_ROLE_BY_TYPE = {
  "system/message": "system",
  "user/message": "user",
  "assistant/message": "assistant",
  "tool/result": "user"
};
function assertMessageEventShape(event, subject) {
  const type = event["type"];
  if (!isMessageEventType(type)) return;
  const data = event["data"];
  const record = typeof data === "object" && data !== null ? data : void 0;
  const message = type === "user/message" ? record : record?.["message"];
  if (typeof message !== "object" || message === null || typeof message["id"] !== "string" || message["id"] === "") {
    throw new Error(`${subject} lacks an identified message`);
  }
  const messageRecord = message;
  const expectedRole = MESSAGE_ROLE_BY_TYPE[type];
  if (messageRecord["role"] !== expectedRole) {
    throw new Error(`${subject} message must have role "${expectedRole}"`);
  }
  const source = messageRecord["source"];
  if (typeof source !== "object" || source === null || typeof source["kind"] !== "string" || source["kind"] === "") {
    throw new Error(`${subject} message has invalid source`);
  }
  if (!Array.isArray(messageRecord["content"])) {
    throw new Error(`${subject} message has invalid content`);
  }
  const sourceRecord = source;
  if (type === "system/message") {
    if (sourceRecord["kind"] !== "plugin" || typeof sourceRecord["plugin"] !== "string" || sourceRecord["plugin"] === "") {
      throw new Error(`${subject} message must have plugin source`);
    }
    return;
  }
  if (type === "assistant/message") {
    if (sourceRecord["kind"] !== "model" || !hasProviderModel(sourceRecord)) {
      throw new Error(`${subject} message must have model source`);
    }
    return;
  }
  if (type !== "tool/result") return;
  if (sourceRecord["kind"] !== "tool" || typeof sourceRecord["callId"] !== "string" || sourceRecord["callId"] === "") {
    throw new Error(`${subject} message must have tool source`);
  }
  const content = messageRecord["content"];
  const block = content[0];
  if (content.length !== 1 || typeof block !== "object" || block === null || block["type"] !== "tool-result" || !Array.isArray(block["content"])) {
    throw new Error(`${subject} message must contain one tool-result block`);
  }
  if (block["toolCallId"] !== sourceRecord["callId"]) {
    throw new Error(`${subject} message has mismatched tool call ids`);
  }
}
function hasProviderModel(value) {
  if (typeof value !== "object" || value === null) return false;
  const pair = value;
  return typeof pair["provider"] === "string" && pair["provider"].length > 0 && typeof pair["model"] === "string" && pair["model"].length > 0;
}
function collectSessionCallbacks(ctx, args) {
  return [...ctx.events.dispatch("emit", args)];
}
function invokeContainedSessionObservers(ctx, name, id, args, callbacks) {
  for (const callback of callbacks) {
    try {
      const returned = callback(...args);
      void Promise.resolve(returned).catch((error) => {
        ctx.logger.warn(`session "${id}": ${name} listener rejected: ${String(error)}`);
      });
    } catch (error) {
      ctx.logger.warn(`session "${id}": ${name} listener threw: ${String(error)}`);
    }
  }
}
var attachments = /* @__PURE__ */ new WeakMap();
var Session = class _Session {
  log = [];
  /** Single incremental owner of surface acceptance and projection state. */
  surfaceManager;
  /** The ordered surface over this session's event log. */
  get surface() {
    return this.surfaceManager;
  }
  /**
   * Detached, deep-frozen creation metadata (format version, cwd, lineage,
   * and whether fork history exists). Supplied by the store via `ctx.sessions.create()`. When a
   * `Session` is created without a store-owned header, a minimal header is
   * synthesized (stamped with the current {@link SESSION_FORMAT_VERSION}) so
   * `session.header` is always present. Kept out of the event log — it is a
   * storage concern, not replayable conversation state.
   */
  header;
  /** Number of leading events inherited from this Session's fork parent. */
  inheritedEventCount;
  /** The session identity, derived from its durable header's single copy. */
  get id() {
    return this.header.id;
  }
  /**
   * The first seq appended IN THIS PROCESS: the length of the constructor
   * seed (0 without one). Events with smaller seq values entered through
   * construction — replay, fork, or resume — and were never published on the
   * `session/event` firehose (constructor seeds do not emit). This offset marks
   * the constructor-input boundary for lifecycle ownership and persistence
   * adoption; consumers that need complete canonical history still start at
   * seq 0. Distinct from {@link inheritedEventCount}, the DURABLE
   * fork-lineage cut: a resumed session's constructor seed is its full stored
   * log, while the inherited count keeps the original fork value — this field is the
   * in-process construction fact.
   *
   * Not persisted itself: a seeded session projects it into the log as the
   * `session/end-seed` event, which is what a consumer reading STORED history
   * reads. Locate the LAST such event, not necessarily one at this seq — a
   * seed already ending in one is not re-marked, so reopening an untouched
   * session leaves that event at a smaller seq than `firstLiveSeq`. Prefer
   * this field in-process: it is exact before the marker reaches storage.
   *
   * When this lifecycle appends the marker, it occupies this seq before the
   * store attaches and therefore does not publish either. Otherwise this seq
   * holds an ordinary published write.
   */
  firstLiveSeq;
  /**
   * Create a detached session by validating and snapshotting borrowed seed
   * events and storage metadata.
   * @param id - session identity.
   * @param seed - optional borrowed replay or fork events.
   * @param header - optional borrowed storage metadata.
   * @param inheritedEventCount - exact fork-inherited prefix length for a seeded header.
   * @param projections - pure interpreters for plugin-owned message changes.
   * @returns a detached session.
   * @throws when a seed event requires a missing message interpreter or fails validation.
   */
  static create(id, seed, header, inheritedEventCount, projections) {
    return new _Session(id, seed, header, "snapshot", inheritedEventCount, projections);
  }
  /**
   * Restore a detached session by adopting an independently owned or deeply frozen seed.
   * Runtime-required event fields, event envelopes, sequence continuity, surface
   * transitions, and header fields are validated without copying or freezing events.
   * Embedded Assistant streams remain opaque until a stream consumer or storage
   * verifier reads them.
   * @param id - restored session identity.
   * @param seed - independently owned or deeply frozen events.
   * @param header - independently owned storage metadata.
   * @param inheritedEventCount - exact fork-inherited prefix length decoded from storage.
   * @param eventState - aliasing state carried from the operation that produced the seed.
   * @param projections - pure interpreters for plugin-owned message changes.
   * @returns a restored detached session.
   * @throws when a seed event requires a missing message interpreter or fails validation.
   */
  static fromRestore(id, seed, header, inheritedEventCount, eventState, projections) {
    return new _Session(
      id,
      seed,
      header,
      eventState,
      inheritedEventCount,
      projections
    );
  }
  constructor(id, seed, header, mode = "snapshot", suppliedInheritedEventCount, projections = []) {
    this.surfaceManager = new SurfaceManager(this.log, SessionLogOffset(0), projections);
    const restoredHeader = mode === "snapshot" ? void 0 : validateRestoredSessionHeader(id, header);
    if (seed !== void 0) {
      for (const [index, source] of seed.entries()) {
        const snapshot = mode === "snapshot" ? snapshotJsonValue(source) : source;
        if (snapshot === void 0) {
          throw new Error(`seed event at index ${index} is not losslessly JSON-serializable`);
        }
        assertSessionEventEnvelope(snapshot, index);
        if (snapshot.seq !== index) {
          throw new Error(`seed event at index ${index} has seq ${snapshot.seq} (expected ${index}); seed must be contiguous from 0`);
        }
        try {
          this.surfaceManager.validateNext(snapshot);
        } catch (error) {
          throw new Error(`invalid seed event at index ${index}: ${error instanceof Error ? error.message : "invalid surface metadata"}`);
        }
        this.log.push(mode === "snapshot" ? deepFreeze2(snapshot) : snapshot);
      }
    }
    this.firstLiveSeq = SessionLogOffset(this.log.length);
    this.header = restoredHeader ?? snapshotSessionHeader(id, header);
    if (this.header.isSeeded && seed === void 0) {
      throw new Error("seeded session requires an explicit constructor seed");
    }
    if (this.header.isSeeded && suppliedInheritedEventCount === void 0) {
      throw new Error("seeded session requires an inherited event count");
    }
    const inheritedEventCount = SessionLogOffset(suppliedInheritedEventCount ?? 0);
    if (!this.header.isSeeded && inheritedEventCount !== 0) {
      throw new Error("unseeded session inherited event count must be 0");
    }
    if (inheritedEventCount > this.log.length) {
      throw new Error("session inherited event count exceeds its event log");
    }
    if (mode === "snapshot" && this.header.isSeeded && inheritedEventCount !== this.log.length) {
      throw new Error("seeded session constructor seed must equal its inherited prefix");
    }
    this.inheritedEventCount = inheritedEventCount;
    if (seed !== void 0 && mode === "snapshot" && this.header.isSeeded) {
      this.append("session/end-seed", { inherited: true });
    } else if (seed !== void 0 && this.log.at(-1)?.type !== "session/end-seed") {
      this.append("session/end-seed", {});
    }
  }
  /** Cached immutable full snapshot of the private append-only log. */
  eventsSnapshot;
  /**
   * Return the immutable event stored at one exact sequence number.
   * @deprecated Existing logic may remain unmigrated for now, but new calls are prohibited.
   * See the [Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).
   * @param seq - event sequence number.
   * @returns the accepted event, or undefined when the log does not contain it.
   */
  eventAt(seq) {
    return this.log[seq];
  }
  /**
   * Materialize an immutable snapshot of a half-open event sequence range.
   * A full current snapshot is reused until the next append; every previously
   * returned snapshot remains stable after later appends.
   * @deprecated Existing logic may remain unmigrated for now, but new calls are prohibited.
   * See the [Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).
   * @param fromSeq - non-negative inclusive sequence number; defaults to the log start.
   * @param toSeqExclusive - non-negative exclusive sequence number; defaults to the current end.
   * @returns a frozen array of the selected deeply frozen events.
   */
  snapshotEvents(fromSeq = SessionLogOffset(0), toSeqExclusive = this.seq) {
    if (fromSeq === 0 && toSeqExclusive === this.log.length) {
      this.eventsSnapshot ??= Object.freeze([...this.log]);
      return this.eventsSnapshot;
    }
    return Object.freeze(this.log.slice(fromSeq, toSeqExclusive));
  }
  /**
   * Return this Session's events after its fork-inherited prefix.
   * @deprecated Existing logic may remain unmigrated for now, but new calls are prohibited.
   * See the [Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).
   * @returns a fresh array containing child-owned events in log order.
   */
  ownEvents() {
    return this.snapshotEvents(this.inheritedEventCount);
  }
  /**
   * Whether one existing event position is outside the fork-inherited prefix.
   * @param seq - event position in this Session.
   * @returns true when the event belongs to this Session rather than its parent.
   */
  isOwnSeq(seq) {
    return seq >= this.inheritedEventCount && seq < this.seq;
  }
  /** The next event's sequence number — always the log length (the `seq = log.length` contiguity contract). */
  get seq() {
    return SessionLogOffset(this.log.length);
  }
  /**
   * Append one typed event to the log and synchronously notify observers via
   * the store-owned, module-private publication hooks. The hot path never blocks
   * on I/O — persistence plugins buffer asynchronously. Once the event enters
   * the log, the append is committed: observer failures are logged and
   * contained per listener, so they do not change the return value or prevent
   * later listeners from observing the same accepted event.
   *
   * @param type - The event type (key of {@link SessionEventMap}).
   * @param data - The event payload; must be JSON-serializable.
   * @param opts - Surface metadata: `surfaceOp` controls how the event enters
   *   the ordered surface; `sourceEventSeqs` lists the seq numbers of earlier
   *   events this one derives from. REQUIRED for
   *   {@link SurfaceEventType} events (every message-producing event must
   *   declare how it joins the surface, the sole source of derived model
   *   history) and
   *   rejected by the compiler for non-surface types like `turn/start` or
   *   `assistant/attempt`. Assistant messages embed their exact provider
   *   stream and cannot cite top-level source events.
   * @returns the logged event — its assigned `seq`/`time` plus the SNAPSHOT of
   *   `data` that entered the log, so reading `event.data` back sees the logged
   *   value, never the caller's still-mutable input.
   * @throws if `data` or surface metadata is not losslessly JSON-serializable
   *   (BigInt, function, symbol, undefined, negative zero, non-finite number,
   *   circular reference, sparse array, or an exotic object such as
   *   Map/Set/Date/class instance), or when the candidate violates the
   *   request-header empty-field or tool-error consistency rules, or the
   *   canonical surface contract (marker shape and eligibility, unique
   *   earlier source-event references, positional replacement validity, and complete
   *   shadowed-node coverage). One iterative pass reads, validates, and
   *   copies each nested value once, so a stateful getter cannot supply one value
   *   to validation and another to storage. The event log is the durable source
   *   of truth, so a bad event fails at the append site rather than later during
   *   a backend flush. A synchronous internal dispatch validation failure or an
   *   append reentered while this acceptance/publication boundary is open also
   *   rejects before the log changes.
   */
  append(type, data, ...opts) {
    const surfaceOpts = opts[0];
    const surfaceMetadata = {
      ...surfaceOpts?.sourceEventSeqs === void 0 ? {} : { sourceEventSeqs: surfaceOpts.sourceEventSeqs },
      ...surfaceOpts?.surfaceOp === void 0 ? {} : { surfaceOp: surfaceOpts.surfaceOp }
    };
    const dataSnapshot = snapshotJsonValue(data);
    if (dataSnapshot === void 0) {
      throw new Error(`session event "${type}" carries non-JSON-serializable data`);
    }
    const surfaceMetadataSnapshot = snapshotJsonValue(surfaceMetadata);
    if (surfaceMetadataSnapshot === void 0) {
      throw new Error(`session event "${type}" carries non-JSON-serializable surface metadata`);
    }
    const entry = attachments.get(this);
    if (entry?.appending) {
      throw new Error("session append cannot reenter while another append is being published");
    }
    const event = deepFreeze2({
      type,
      seq: SessionSeq(this.log.length),
      time: Date.now(),
      data: dataSnapshot,
      ...surfaceMetadataSnapshot
    });
    validateSessionEventData(event, `session event "${type}" at seq ${event.seq}`);
    this.surfaceManager.validateNext(event);
    if (entry !== void 0) entry.appending = true;
    try {
      let callbacks;
      const callbackArgs = [this, event];
      if (entry !== void 0) {
        callbacks = collectSessionCallbacks(entry.emitCtx, [entry.carrier, "session/event", ...callbackArgs]);
      }
      this.log.push(event);
      this.eventsSnapshot = void 0;
      if (callbacks !== void 0 && entry !== void 0) {
        invokeContainedSessionObservers(entry.emitCtx, "session/event", entry.id, callbackArgs, callbacks);
      }
      return event;
    } finally {
      if (entry !== void 0) {
        entry.appending = false;
        if (entry.detachRequested && !entry.announcing) entry.detach();
      }
    }
  }
  /** Cached fold of the request-header events — see {@link requestHeader}. */
  headerFold;
  /** Log position (events consumed) the header fold has reached. */
  headerFoldSeq = 0;
  /**
   * The {@link EpochHeader} in force after the log's last header event — the
   * header the NEXT request will be compared against — or undefined before
   * the first `request/header` snapshot. The live, incrementally-maintained
   * form of `foldRequestHeader(session.snapshotEvents())`: each header event is folded
   * once, when first seen, so a per-step read costs O(new events).
   * @returns the folded header, or undefined when no header event exists yet.
   */
  requestHeader() {
    if (this.headerFoldSeq < this.log.length) {
      this.headerFold = deepFreeze2(foldRequestHeader(this.log.slice(this.headerFoldSeq), this.headerFold));
      this.headerFoldSeq = this.log.length;
    }
    return this.headerFold;
  }
  /** Cached fold of `request/context` events. */
  contextFold;
  contextFoldSeq = 0;
  /**
   * Return the latest resolved route metadata, or `undefined` before the first
   * `request/context` event. Each event is folded once.
   * @returns the latest immutable route metadata.
   */
  requestContext() {
    if (this.contextFoldSeq < this.log.length) {
      for (const event of this.log.slice(this.contextFoldSeq)) {
        if (event.type === "request/context") this.contextFold = deepFreeze2({ ...event.data });
      }
      this.contextFoldSeq = this.log.length;
    }
    return this.contextFold;
  }
  /** The derived-message cache: frozen projections, extended per unseen node. */
  derived = [];
  /** Surface position (nodes projected) the cache has reached. */
  derivedNodes = 0;
  /** {@link SurfaceManager.contentGeneration} the cache was built under. */
  derivedGeneration = 0;
  /**
   * Derive the LLM message history by walking the ordered sequences of
   * message-producing events maintained by `surfaceOp` markers. The
   * surface is the single source of derived history: every message-producing
   * append records its `surfaceOp`, so a raw event with no marker (a chunk, a
   * turn boundary) is correctly absent, and a compaction `replace` deletes the
   * shadowed nodes from the derivation. The projection rules are
   * {@link deriveEventMessage}, with logged message projections applied
   * without changing node membership or message identity.
   *
   * CACHED: pure tail growth costs O(new nodes); a replacement or message projection
   * ({@link SessionSurface.contentGeneration}) rebuilds. The returned array is
   * a fresh snapshot per call (later appends never grow an array a caller
   * already holds); the `Message` objects in it are SHARED and **deep-frozen**.
   * Unchanged content reuses frozen event data; projected blocks are frozen
   * derived copies. Consumers cannot mutate the log through either form.
   * @returns a fresh array of the shared, frozen derived history.
   */
  deriveMessages() {
    const surface = this.surface;
    const nodes = surface.nodes;
    const generation = surface.contentGeneration;
    if (generation !== this.derivedGeneration) {
      this.derived = [];
      this.derivedNodes = 0;
      this.derivedGeneration = generation;
    }
    for (const seq of nodes.slice(this.derivedNodes)) {
      const msg = this.deriveEventMessage(this.log[seq]);
      if (msg) this.derived.push(msg);
    }
    this.derivedNodes = nodes.length;
    return [...this.derived];
  }
  /**
   * Project one event with all committed message projections applied.
   * The original durable event remains unchanged.
   * @param event - the event to project.
   * @returns the derived message, or null when the event produces none.
   */
  deriveEventMessage(event) {
    return this.surfaceManager.deriveEventMessage(event);
  }
};
var SessionForkError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "SessionForkError";
  }
  code;
};
var SessionStore = class extends Service {
  store = /* @__PURE__ */ new Map();
  counter = 0;
  projections = [];
  /** Borrowed definitions for detached replay; contributions live until their registering fibers unload. */
  get messageProjections() {
    return this.projections;
  }
  /**
   * Register one event interpreter for live creation, restore, and fork.
   * Disposing the contribution makes sessions that used it refuse further derivation.
   * @param projection - pure definition owned by the event's plugin.
   * @returns the fiber-owned disposer.
   * @throws when another definition already owns this event type.
   */
  registerMessageProjection(projection) {
    if (this.projections.some((item) => item.type === projection.type)) {
      throw new Error(`session message projection "${projection.type}" is already registered`);
    }
    return this.ctx.effect(() => {
      this.projections.push(projection);
      return () => {
        this.projections.splice(this.projections.indexOf(projection), 1);
      };
    }, "sessions.registerMessageProjection()");
  }
  constructor(ctx) {
    super(ctx, "sessions");
    ctx.inject(["typert"], (typeCtx) => {
      typeCtx.typert.lookups.register("session", {
        parameter: "session",
        wire: "sessionId",
        hostTypeSymbol: "@deepseek-ai/dsh-session#Session",
        wireTypeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
        resolve: (sessionId) => this.get(sessionId)
      });
    });
  }
  /**
   * Create a session owned by the calling fiber: disposing that fiber stops
   * event notification and removes the session from the store. `options.seed`
   * populates the session with a copy of those events (replay/fork);
   * `options.meta` attaches creation metadata (validated absolute `cwd`, seed
   * and parent lineage, and delegation depth) as the immutable
   * {@link SessionHeader} (the store fills `version`/`id`/`createdAt`).
   *
   * For an agent whose session must be torn down IN ORDER with its loop (so the
   * loop's final events are published before the store attachment ends), do NOT use this
   * — fold the session lifecycle into the agent's own effect via
   * {@link prepare} + {@link enter} + {@link announce} (see
   * `dsh-agent-loop`'s creation transaction).
   *
   * @param id - the session id; omitted, the store mints `session-<n>`.
   * @param options - seed events and/or creation metadata for the header.
   * @returns the live session, already entered and announced.
   * @throws if a session with `id` already exists, metadata is not a plain
   *   lossless-JSON record with valid scalar fields, or `meta.cwd` is a
   *   non-absolute path (storage backends key directories off it).
   */
  create(id, options) {
    const session = this.prepare(id, options);
    this.ctx.effect(function* () {
      yield this.enter(session);
      this.announce(session);
    }.bind(this), "sessions.create()");
    return session;
  }
  /**
   * Build a session WITHOUT entering it into the store — validate the id/cwd and
   * construct the {@link Session} (with its immutable {@link SessionHeader}).
   * Pairs with {@link enter} + {@link announce}: a caller that owns a composite
   * `ctx.effect` (the agent factory) folds the session lifecycle into that ONE
   * effect so a fiber unload tears the session + agent down as a single ORDERED
   * chain rather than as racing sibling effects — which would remove the publication hooks
   * before the driver's closing events commit, dropping them.
   *
   * @param id - the session id; omitted, the store mints `session-<n>`.
   * @param options - seed events and/or creation metadata for the header. With
   *   `eventState`, every seed event is either independently owned or any
   *   shared value is deeply frozen; {@link Session.fromRestore} validates and
   *   adopts those values without copying or freezing them.
   * @returns the constructed session, NOT yet in the store.
   * @throws if a session with `id` already exists, metadata is not a plain
   *   lossless-JSON record with valid scalar fields, or `meta.cwd` is a
   *   non-absolute path.
   */
  prepare(id, options) {
    let sessionId;
    if (id === void 0) {
      do
        sessionId = brandString3(`session-${++this.counter}`);
      while (this.store.has(sessionId));
    } else {
      sessionId = brandString3(id);
    }
    if (this.store.has(sessionId)) throw new Error(`session "${sessionId}" already exists`);
    if (options !== void 0) {
      const { eventState } = options;
      switch (eventState) {
        case "detached":
        case "shared-frozen":
          return Session.fromRestore(
            sessionId,
            options.seed,
            options.meta,
            options.inheritedEventCount,
            eventState,
            this.projections
          );
        case void 0:
          break;
        /* v8 ignore next -- closed-union exhaustiveness guard */
        default:
          assertNever(eventState, "SessionStore.prepare event state");
      }
    }
    const seed = options?.seed;
    const meta = options?.meta;
    const header = {
      version: SESSION_FORMAT_VERSION,
      id: sessionId,
      createdAt: meta?.createdAt ?? Date.now(),
      ...meta?.cwd === void 0 ? {} : { cwd: meta.cwd },
      ...meta?.parentSession === void 0 ? {} : { parentSession: meta.parentSession },
      isSeeded: meta?.isSeeded ?? false,
      ...meta?.origin === void 0 ? {} : { origin: meta.origin },
      ...meta?.delegationDepth === void 0 ? {} : { delegationDepth: meta.delegationDepth },
      ...meta?.agentPreset === void 0 ? {} : { agentPreset: meta.agentPreset }
    };
    return Session.create(sessionId, seed, header, options?.inheritedEventCount, this.projections);
  }
  /**
   * Enter a {@link prepare}d session into the store: install the module-private
   * append publication hooks and add it to the store. Returns the DETACH
   * disposer (hooks + store removal). Does NOT emit `session/created` —
   * the caller yields this disposer inside its effect and THEN calls
   * {@link announce}, so a throwing `session/created` listener rolls the attach
   * back instead of leaking it.
   *
   * Re-checks the id for a duplicate: `prepare` and `enter` are public
   * cross-package primitives and a caller may interleave arbitrary work (or
   * another create) between them, so a stale prepared session must NOT overwrite
   * a live store entry of the same id — its detach disposer would later delete
   * the REAL session. The {@link create} convenience and the agent factory call
   * the two back-to-back so they never trip this, but the public API cannot
   * assume that.
   *
   * @param session - a {@link prepare}d session not yet in the store.
   * @returns the detach disposer (publication hooks + store removal). When called from
   *   a synchronous `session/created` listener, removal and disposal wait until
   *   that creation dispatch unwinds.
   * @throws if a session with this id is already in the store.
   */
  enter(session) {
    const id = session.id;
    const carrier = scopeTarget(session, scopeOf(this.ctx));
    if (this.store.has(id)) throw new Error(`session "${id}" already exists`);
    if (attachments.has(session)) throw new Error(`session "${id}" is already attached to a store`);
    const entry = {
      id,
      session,
      carrier,
      emitCtx: this.ctx,
      announced: false,
      announcing: false,
      appending: false,
      detachRequested: false,
      detach: () => {
        this.detachEntered(entry);
      }
    };
    this.store.set(id, entry);
    attachments.set(session, entry);
    let entered = true;
    const detach = () => {
      if (!entered) return;
      entered = false;
      if (entry.announcing || entry.appending) {
        entry.detachRequested = true;
        return;
      }
      entry.detach();
    };
    return detach;
  }
  /** Remove one exact entered session and emit its paired disposal when announced. */
  detachEntered(entry) {
    entry.detachRequested = false;
    if (this.store.get(entry.id) !== entry) return;
    this.store.delete(entry.id);
    attachments.delete(entry.session);
    if (entry.announced) this.emitDisposed(entry);
  }
  /** Emit `session/created` exactly once for an {@link enter}ed session (with
   * the carrier {@link enter} captured). Separate from {@link enter} so the
   * caller can yield the detach disposer first (rollback safety — see
   * {@link enter}).
   * @param session - the entered session to announce to listeners.
   * @throws if the session is not live or its announcement already began,
   *   including a reentrant call from a creation listener. */
  announce(session) {
    const entry = this.liveEntryFor(session);
    if (entry.announced || entry.announcing) {
      throw new Error(`session "${entry.id}" was already announced`);
    }
    entry.announced = true;
    const callbackArgs = [session];
    entry.announcing = true;
    try {
      const callbacks = collectSessionCallbacks(this.ctx, [entry.carrier, "session/created", session]);
      for (const callback of callbacks) {
        const returned = callback(...callbackArgs);
        void Promise.resolve(returned).catch((error) => {
          this.ctx.logger.warn(`session "${entry.id}": session/created listener rejected: ${String(error)}`);
        });
      }
    } finally {
      entry.announcing = false;
      if (entry.detachRequested && !entry.appending) entry.detach();
    }
  }
  /** Emit the paired teardown notification with per-listener containment. */
  emitDisposed(entry) {
    const callbackArgs = [entry.session];
    try {
      const callbacks = collectSessionCallbacks(this.ctx, [entry.carrier, "session/disposed", entry.session]);
      invokeContainedSessionObservers(this.ctx, "session/disposed", entry.id, callbackArgs, callbacks);
    } catch (error) {
      this.ctx.logger.warn(`session "${entry.id}": session/disposed dispatch threw: ${String(error)}`);
    }
  }
  /**
   * Dispatch the awaited `session/flush` durability checkpoint for `session`,
   * with the carrier captured at {@link enter}. THE flush entry point: the
   * store owns the carrier, so callers (the checkpoint policy's per-request
   * barrier, goal-round-driver's idle checkpoint, teardown drains, and consumers
   * that flush themselves before reading storage) must come through here
   * rather than dispatch a raw `ctx.parallel('session/flush', …)` — one owner,
   * one spelling, and the scoped-dispatch invariant can pin it.
   * @param session - the session whose buffered events must reach durable storage.
   * @returns whether at least one durability listener participated, after every
   *   listener has settled successfully.
   * @throws the first registered listener failure after every listener settles.
   */
  async flush(session) {
    const { carrier } = this.liveEntryFor(session);
    const callbackArgs = [session];
    const callbacks = collectSessionCallbacks(this.ctx, [carrier, "session/flush", session]);
    const results = await Promise.allSettled(callbacks.map((callback) => {
      try {
        return callback(...callbackArgs);
      } catch (error) {
        return Promise.reject(error);
      }
    }));
    const failure = results.find((result) => result.status === "rejected");
    if (failure !== void 0) throw failure.reason;
    return callbacks.length > 0;
  }
  /** Return the exact live entry; detached/prepared objects reject. */
  liveEntryFor(session) {
    const entry = attachments.get(session);
    if (entry === void 0 || this.store.get(entry.id) !== entry) {
      throw new Error(`session "${session.id}" is not live in this store`);
    }
    return entry;
  }
  /**
   * Look up a live session.
   * @param id - the session id to look up.
   * @returns the session, or undefined when no live session has that id.
   */
  get(id) {
    return this.store.get(id)?.session;
  }
  /**
   * All live sessions, in creation order.
   * @returns a fresh array; mutating it does not affect the store.
   */
  list() {
    return [...this.store.values()].map((entry) => entry.session);
  }
  /**
   * Create a live child session from a stable prefix of a live source.
   * `boundary` is an inclusive source event seq; omitted means the source's
   * current last event. The selected slice may end with a between-turn event
   * but must not end inside an open turn.
   *
   * @param source - Live source session object or id.
   * @param boundary - Inclusive source event seq to fork through; omitted means
   *   the source's current last event, and omitted on an empty source forks an
   *   empty child.
   * @param childSessionId - Optional child session id; omitted delegates to
   *   `SessionStore`'s id policy.
   * @returns The created live child session.
   */
  fork(source, boundary, childSessionId) {
    if (childSessionId !== void 0 && this.get(childSessionId) !== void 0) {
      throw new SessionForkError(`session "${childSessionId}" already exists`, "SESSION_ALREADY_EXISTS");
    }
    const liveSource = this._resolveForkSource(source);
    const seed = this._forkSeed(liveSource, boundary);
    return this.create(childSessionId, {
      seed,
      inheritedEventCount: SessionLogOffset(seed.length),
      meta: {
        ...liveSource.header.cwd !== void 0 ? { cwd: liveSource.header.cwd } : {},
        parentSession: liveSource.id,
        isSeeded: true
      }
    });
  }
  _forkSeed(session, requestedBoundary) {
    const lastEvent = session.snapshotEvents().at(-1);
    let boundary;
    if (requestedBoundary !== void 0) {
      boundary = requestedBoundary;
    } else {
      if (lastEvent === void 0) return [];
      boundary = lastEvent.seq;
    }
    if (!Number.isSafeInteger(boundary) || boundary < 0) {
      throw new SessionForkError(
        `fork boundary for session "${session.id}" must be a non-negative safe integer, got ${String(boundary)}`,
        "INVALID_BOUNDARY"
      );
    }
    if (boundary >= session.seq) {
      const lastSeq = lastEvent?.seq;
      throw new SessionForkError(
        `fork boundary ${boundary} does not exist in session "${session.id}" (last seq: ${lastSeq ?? "none"})`,
        "INVALID_BOUNDARY"
      );
    }
    const boundaryEvent = session.eventAt(boundary);
    if (boundaryEvent === void 0 || boundaryEvent.seq !== boundary) {
      throw new SessionForkError(
        `fork boundary ${boundary} does not match a contiguous event seq in session "${session.id}"`,
        "INVALID_BOUNDARY"
      );
    }
    const events = session.snapshotEvents(SessionLogOffset(0), SessionLogOffset(boundary + 1));
    const lastTurnBoundary = events.findLast((event) => event.type === "turn/start" || event.type === "turn/end");
    if (lastTurnBoundary?.type === "turn/start") {
      throw new SessionForkError(
        `fork boundary ${boundary} in session "${session.id}" ends inside open turn ${lastTurnBoundary.data.turn}`,
        "OPEN_TURN"
      );
    }
    return events;
  }
  _resolveForkSource(source) {
    if (typeof source === "string") {
      const session = this.get(source);
      if (session === void 0) throw new SessionForkError(`session "${source}" not found`, "SESSION_NOT_FOUND");
      return session;
    }
    const live = this.get(source.id);
    if (live === void 0) {
      throw new SessionForkError(`session "${source.id}" not found`, "SESSION_NOT_FOUND");
    }
    if (live !== source) throw new SessionForkError(`session "${source.id}" is not the live store instance`, "SESSION_NOT_LIVE");
    return source;
  }
};
var index_default = SessionStore;
export {
  KNOWN_SESSION_EVENT_TYPES,
  SESSION_FORMAT_VERSION,
  Session,
  SessionForkError,
  SessionId,
  SessionLogOffset,
  SessionPreparation,
  SessionSeq,
  SessionStore,
  TOOL_NOT_STARTED,
  TOOL_OUTCOME_UNKNOWN,
  adoptSessionEvent,
  canonicalHeader,
  decodeSeqRanges,
  index_default as default,
  deriveEventMessage,
  encodeSeqRanges,
  foldRequestHeader,
  foldSurface,
  headerEquals,
  interruptedTurnClosers,
  isAppendSurfaceEvent,
  isReplacementSurfaceEvent,
  isSurfaceEligibleType,
  isSurfaceEvent,
  snapshotSessionEvent
};
//# sourceMappingURL=index.js.map
