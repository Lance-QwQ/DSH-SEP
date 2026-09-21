// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs/src/invariant.ts
var PACKAGE_NAME = "@deepseek-ai/dsh-fs";
var name = "fs-invariant";
var inject = ["invariants"];
function validateTarget(target, fail) {
  if (target.targetKey.length === 0) fail("filesystem event targetKey must be non-empty");
  if (target.displayPath.length === 0) fail("filesystem event displayPath must be non-empty");
}
var install = (ctx, fail) => {
  ctx.on("internal/dispatch", (_mode, eventName, args) => {
    if (eventName !== "fs/write-intent" && eventName !== "fs/edit-intent" && eventName !== "fs/observed") return;
    validateTarget(args[0], fail);
    if (eventName === "fs/observed") {
      const observation = args[1];
      switch (observation.kind) {
        case "present":
          if (observation.version.length === 0) fail("fs/observed present version must be non-empty");
          break;
        case "absent":
          break;
        default:
          fail("fs/observed kind must be present or absent");
      }
    }
  }, { global: true });
};
var apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=invariant.js.map
