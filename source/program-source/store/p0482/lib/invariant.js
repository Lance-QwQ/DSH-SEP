// dsh-host-isolation/candidates/dsh-rc2-managed-20260913/memory-settings-ui/lib/types/invariant.js
var name = "client-ui-settings-memory-invariant";
var inject = ["invariants"];
var install = () => {
};
var apply = (ctx) => Promise.resolve(ctx.invariants.register("@deepseek-ai/dsh-client-ui-settings-memory", install));
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=invariant.js.map
