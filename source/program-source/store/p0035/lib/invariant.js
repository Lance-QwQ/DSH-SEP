// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/invariant.ts
import { assertNever } from "@deepseek-ai/dsh-util-values";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/repair.ts
import { brandString as brandString2 } from "@deepseek-ai/dsh-brand";
import { deepFreeze } from "@deepseek-ai/dsh-util-values";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/types.ts
import { brandNumber, brandString } from "@deepseek-ai/dsh-brand";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/repair.ts
var TOOL_NOT_STARTED = "TOOL_NOT_STARTED";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/session/src/invariant.ts
var PACKAGE_NAME = "@deepseek-ai/dsh-session";
var name = "session-invariant";
var inject = ["invariants"];
function requireOpenStep(trace, kind, turn, step, fail) {
  if (trace.openTurn !== turn || trace.openStep !== step) {
    fail(`${kind} names turn ${turn}/step ${step} but open is turn ${trace.openTurn}/step ${trace.openStep}`);
  }
}
function validateEvent(trace, event, fail) {
  if (event.seq <= trace.lastSeq) {
    fail(`seq must strictly increase: saw ${event.seq} after ${trace.lastSeq}`);
  }
  let openTurn = trace.openTurn;
  let openStep = trace.openStep;
  let nextTurn = trace.nextTurn;
  let nextStep = trace.nextStep;
  let pendingCalls = { kind: "none" };
  switch (event.type) {
    case "turn/start": {
      if (trace.openTurn !== null) {
        fail(`turn/start ${event.data.turn} while turn ${trace.openTurn} is still open`);
      }
      if (event.data.turn !== trace.nextTurn) {
        fail(`turn/start expected turn ${trace.nextTurn}, got ${event.data.turn}`);
      }
      openTurn = event.data.turn;
      nextStep = 1;
      break;
    }
    case "turn/end": {
      if (trace.openTurn !== event.data.turn) {
        fail(`turn/end ${event.data.turn} does not match open turn ${trace.openTurn}`);
      }
      if (trace.openStep !== null) {
        fail(`turn/end ${event.data.turn} while step ${trace.openStep} is still open`);
      }
      openTurn = null;
      nextTurn += 1;
      break;
    }
    case "step/start": {
      if (trace.openTurn !== event.data.turn) {
        fail(`step/start in turn ${event.data.turn} but open turn is ${trace.openTurn}`);
      }
      if (trace.openStep !== null) {
        fail(`step/start ${event.data.step} while step ${trace.openStep} is still open`);
      }
      if (event.data.step !== trace.nextStep) {
        fail(`step/start expected step ${trace.nextStep} in turn ${event.data.turn}, got ${event.data.step}`);
      }
      openStep = event.data.step;
      break;
    }
    case "step/end": {
      requireOpenStep(trace, "step/end", event.data.turn, event.data.step, fail);
      pendingCalls = { kind: "clear" };
      openStep = null;
      nextStep += 1;
      break;
    }
    case "assistant/attempt": {
      requireOpenStep(trace, "assistant/attempt", event.data.turn, event.data.step, fail);
      break;
    }
    case "assistant/message": {
      requireOpenStep(trace, "assistant/message", event.data.turn, event.data.step, fail);
      break;
    }
    case "tool/call": {
      requireOpenStep(trace, "tool/call", event.data.turn, event.data.step, fail);
      pendingCalls = { kind: "add", callId: event.data.callId };
      break;
    }
    case "tool/result": {
      if (event.surfaceOp !== "append") {
        if (trace.openTurn === null) {
          fail("tool/result surface replacement appended outside any open turn");
        }
        break;
      }
      requireOpenStep(trace, "tool/result", event.data.turn, event.data.step, fail);
      const callId = event.data.message.source.callId;
      const syntheticNotStarted = event.data.message.content[0].isError === true && event.data.error?.code === TOOL_NOT_STARTED;
      if (!trace.pendingCalls.has(callId) && !syntheticNotStarted) {
        fail(`tool/result for ${callId} with no prior tool/call in this step`);
      }
      pendingCalls = { kind: "delete", callId };
      break;
    }
    case "system/message": {
      requireOpenStep(trace, "system/message", event.data.turn, event.data.step, fail);
      break;
    }
    case "user/message":
      break;
    case "session/end-seed":
      break;
    case "request/header":
    case "request/context": {
      if (trace.openTurn === null) {
        fail(`${event.type} appended outside any open turn (core execution events must be turn-enclosed)`);
      }
      break;
    }
    default:
      break;
  }
  return {
    scalars: { lastSeq: event.seq, openTurn, openStep, nextTurn, nextStep },
    pendingCalls
  };
}
function applyTransition(trace, transition) {
  Object.assign(trace, transition.scalars);
  switch (transition.pendingCalls.kind) {
    case "none":
      break;
    case "add":
      trace.pendingCalls.add(transition.pendingCalls.callId);
      break;
    case "delete":
      trace.pendingCalls.delete(transition.pendingCalls.callId);
      break;
    case "clear":
      trace.pendingCalls.clear();
      break;
    /* v8 ignore next -- validateEvent produces this closed transition union */
    default:
      assertNever(transition.pendingCalls, "session trace pending-call transition");
  }
}
var install = Object.assign((ctx, fail) => {
  const traces = /* @__PURE__ */ new WeakMap();
  const stagedTransitions = /* @__PURE__ */ new WeakMap();
  const freshTrace = () => ({
    lastSeq: -1,
    openTurn: null,
    openStep: null,
    nextTurn: 1,
    nextStep: 1,
    pendingCalls: /* @__PURE__ */ new Set()
  });
  const seedSession = (session) => {
    const trace = freshTrace();
    traces.set(session, trace);
    for (const event of session.snapshotEvents()) {
      applyTransition(trace, validateEvent(trace, event, fail));
    }
    return trace;
  };
  const traceFor = (session) => traces.get(session) ?? seedSession(session);
  for (const session of ctx.sessions.list()) seedSession(session);
  ctx.on("session/created", (session) => {
    seedSession(session);
  }, { global: true });
  ctx.on("session/event", (session, event) => {
    const staged = stagedTransitions.get(event);
    if (staged === void 0 || staged.session !== session) {
      return fail("session/event reached publication without matching pre-commit validation");
    }
    stagedTransitions.delete(event);
    applyTransition(staged.trace, staged.transition);
  }, { global: true });
  ctx.on("internal/dispatch", (_mode, eventName, args) => {
    if (eventName !== "session/event") return;
    const [session, event] = args;
    const trace = traceFor(session);
    const transition = validateEvent(trace, event, fail);
    stagedTransitions.set(event, { session, trace, transition });
  }, { global: true });
}, { inject: ["sessions"] });
var apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=invariant.js.map
