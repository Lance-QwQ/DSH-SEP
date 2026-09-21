import {
  foldTasks
} from "./chunk-7JF3ULCG.js";

// src/invariant.ts
var name = "task-checkpoint-invariant";
var inject = ["invariants"];
var install = Object.assign((ctx, fail) => {
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
var apply = (ctx) => Promise.resolve(ctx.invariants.register("@deepseek-ai/dsh-task-checkpoint", install));
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=invariant.js.map
