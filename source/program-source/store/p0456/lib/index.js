// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-stats/src/projection.ts
import { z } from "zod";
import { assistantStreamFirstTokenTime } from "@deepseek-ai/dsh-llm";
var sessionStatsSchema = z.object({
  turns: z.number().int().nonnegative(),
  steps: z.number().int().nonnegative(),
  llmMs: z.number().nonnegative(),
  toolMs: z.number().nonnegative(),
  ttftMs: z.number().nonnegative(),
  ttftSteps: z.number().int().nonnegative(),
  decodeMs: z.number().nonnegative(),
  decodeTokens: z.number().nonnegative()
}).strict();
var sessionStatsStateSchema = sessionStatsSchema.extend({
  lastTurn: z.number().int().nonnegative().nullable(),
  openStep: z.object({
    turn: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
    startTime: z.number().nonnegative(),
    firstTokenTime: z.number().nonnegative().nullable()
  }).nullable(),
  pendingCalls: z.record(z.string(), z.number().nonnegative())
});
function usageOutputTokens(usage) {
  if (typeof usage !== "object" || usage === null) return null;
  const value = usage.outputTokens;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
var sessionStatsProjectionDefinition = {
  key: "sessionStats",
  stateVersion: 1,
  stateSchema: sessionStatsStateSchema,
  init: () => ({
    turns: 0,
    steps: 0,
    llmMs: 0,
    toolMs: 0,
    ttftMs: 0,
    ttftSteps: 0,
    decodeMs: 0,
    decodeTokens: 0,
    lastTurn: null,
    openStep: null,
    pendingCalls: {}
  }),
  apply: (state, event) => {
    switch (event.type) {
      case "step/start":
        return {
          ...state,
          openStep: { turn: event.data.turn, step: event.data.step, startTime: event.time, firstTokenTime: null }
        };
      case "assistant/attempt": {
        const open = state.openStep;
        if (open === null || open.turn !== event.data.turn || open.step !== event.data.step) return state;
        const first = assistantStreamFirstTokenTime(event.data.stream) ?? null;
        if (open.firstTokenTime !== null || first === null) return state;
        return { ...state, openStep: { ...open, firstTokenTime: first } };
      }
      case "assistant/message": {
        const open = state.openStep;
        if (open === null || open.turn !== event.data.turn || open.step !== event.data.step) return state;
        const firstToken = open.firstTokenTime ?? assistantStreamFirstTokenTime(event.data.stream) ?? null;
        const next = {
          ...state,
          llmMs: state.llmMs + Math.max(0, event.time - open.startTime),
          openStep: null
        };
        if (firstToken !== null) {
          next.ttftMs += Math.max(0, firstToken - open.startTime);
          next.ttftSteps += 1;
          const outputTokens = usageOutputTokens(event.data.usage);
          if (outputTokens !== null) {
            next.decodeMs += Math.max(0, event.time - firstToken);
            next.decodeTokens += outputTokens;
          }
        }
        return next;
      }
      case "tool/call":
        return { ...state, pendingCalls: { ...state.pendingCalls, [event.data.callId]: event.time } };
      case "tool/result": {
        const callId = event.data.message.source.callId;
        const dispatched = Object.hasOwn(state.pendingCalls, callId) ? state.pendingCalls[callId] : void 0;
        if (dispatched === void 0) return state;
        const pendingCalls = Object.fromEntries(
          Object.entries(state.pendingCalls).filter(([id]) => id !== callId)
        );
        return { ...state, toolMs: state.toolMs + Math.max(0, event.time - dispatched), pendingCalls };
      }
      case "step/end":
        return {
          ...state,
          turns: state.lastTurn === event.data.turn ? state.turns : state.turns + 1,
          steps: state.steps + 1,
          lastTurn: event.data.turn,
          openStep: null
        };
      case "turn/end":
        return Object.keys(state.pendingCalls).length === 0 ? state : { ...state, pendingCalls: {} };
      default:
        return state;
    }
  },
  wire: {
    viewSchema: sessionStatsSchema,
    view: (state) => ({
      turns: state.turns,
      steps: state.steps,
      llmMs: state.llmMs,
      toolMs: state.toolMs,
      ttftMs: state.ttftMs,
      ttftSteps: state.ttftSteps,
      decodeMs: state.decodeMs,
      decodeTokens: state.decodeTokens
    })
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-stats/src/index.ts
var name = "session-stats";
var inject = ["sessionProjections"];
function apply(ctx) {
  ctx.sessionProjections.register(sessionStatsProjectionDefinition);
}
export {
  apply,
  inject,
  name,
  sessionStatsProjectionDefinition
};
//# sourceMappingURL=index.js.map
