// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs-sandbox/src/index.ts
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import { FsError } from "@deepseek-ai/dsh-fs";
import { writableRoots } from "@deepseek-ai/dsh-sandbox";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs-sandbox/src/containment.ts
import { stat } from "node:fs/promises";
import { dirname, sep } from "node:path";
var MISSING_CODES = /* @__PURE__ */ new Set(["ENOENT", "ENOTDIR"]);
function isMissing(error) {
  const code = error.code;
  return MISSING_CODES.has(code);
}
function comparablePath(path, caseSensitive) {
  return caseSensitive ? path : path.toLowerCase();
}
function isLexicallyUnder(path, root, caseSensitive) {
  const comparableTarget = comparablePath(path, caseSensitive);
  const comparableRoot = comparablePath(root, caseSensitive);
  if (comparableTarget === comparableRoot) return true;
  const prefix = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
  return comparableTarget.startsWith(prefix);
}
async function statIfPresent(path) {
  try {
    return await stat(path, { bigint: true });
  } catch (error) {
    if (isMissing(error)) return void 0;
    throw error;
  }
}
function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}
async function isPathUnder(path, root, caseSensitive = process.platform !== "win32") {
  if (isLexicallyUnder(path, root, caseSensitive)) return true;
  const rootInfo = await statIfPresent(root);
  if (!rootInfo) return false;
  let ancestor = path;
  while (true) {
    const ancestorInfo = await statIfPresent(ancestor);
    if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo)) return true;
    const parent = dirname(ancestor);
    if (parent === ancestor) return false;
    ancestor = parent;
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs-sandbox/src/index.ts
var SandboxedFileSystem = class extends LocalFileSystem {
  static inject = ["sandboxPolicy"];
  defaultMode;
  constructor(ctx, config) {
    super(ctx, config);
    this.defaultMode = ctx.sandboxPolicy.defaultMode;
  }
  /** The deployment default mode — the capability fact the tool layer reads to advertise escalation. */
  get sandboxMode() {
    return this.defaultMode;
  }
  /**
   * Fence the write by the per-call policy, then delegate to the inherited
   * atomic write. See {@link checkedTarget}.
   * @param target - the resolved target to write.
   * @param content - the full new file content.
   * @param expected - the write intent guarding the write; omit for unconditional.
   * @param signal - aborts before atomic publication takes effect.
   * @param sandboxPolicy - the per-call mode and workspace root; omit to use
   *   the deployment fallback.
   * @returns the write outcome from the inherited backend.
   */
  async writeText(target, content, expected, signal, sandboxPolicy) {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
    return super.writeText(await this.checkedTarget(target, policy), content, expected, signal, policy);
  }
  /**
   * Fence the edit by the per-call policy, then delegate to the inherited
   * atomic edit. See {@link checkedTarget}.
   * @param target - the resolved target to edit.
   * @param edit - the literal search/replace request.
   * @param expected - the version guard; omit for an unconditional edit.
   * @param signal - aborts before atomic publication takes effect.
   * @param sandboxPolicy - the per-call mode and workspace root; omit to use
   *   the deployment fallback.
   * @returns the edit outcome from the inherited backend.
   */
  async editText(target, edit, expected, signal, sandboxPolicy) {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
    return super.editText(await this.checkedTarget(target, policy), edit, expected, signal, policy);
  }
  /** @param sandboxPolicy - trusted current mode and workspace; omit for deployment policy. */
  async moveFile(source, destination, expected, signal, sandboxPolicy) {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
    return super.moveFile(await this.checkedTarget(source, policy), await this.checkedTarget(destination, policy), expected, signal, policy);
  }
  /** @param sandboxPolicy - trusted current mode and workspace; omit for deployment policy. */
  async removeFile(target, expected, signal, sandboxPolicy) {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
    return super.removeFile(await this.checkedTarget(target, policy), expected, signal, policy);
  }
  /** @param sandboxPolicy - trusted current mode and workspace; omit for deployment policy. */
  async restoreMutation(id, signal, sandboxPolicy) {
    return super.restoreMutation(id, signal, sandboxPolicy ?? this.ctx.sandboxPolicy.resolve());
  }
  /** @param sandboxPolicy - trusted current mode and workspace; omit for deployment policy. */
  async listMutations(sandboxPolicy) {
    return super.listMutations(sandboxPolicy ?? this.ctx.sandboxPolicy.resolve());
  }
  /** @param sandboxPolicy - trusted current mode and workspace; omit for deployment policy. */
  async inspectRecovery(sandboxPolicy) {
    return super.inspectRecovery(sandboxPolicy ?? this.ctx.sandboxPolicy.resolve());
  }
  /**
   * Enforce the per-call policy against `target` and return the EXACT target the
   * mutation must use, so the checked identity is the mutated one (no
   * check-here-write-there TOCTOU). `read-only` denies; `workspace-write`
   * re-canonicalizes NOW (`resolve` realpaths the deepest existing ancestor,
   * reflecting a concurrently swapped symlink), requires containment under a
   * writable root, and returns THAT fresh target; `danger-full-access` returns
   * the caller's target unfenced. Throws the structured `FS_SANDBOX_DENIED` on
   * refusal — the tool layer maps it to the model-facing `[sandbox: …]` marker
   * and the escalation hint.
   */
  async checkedTarget(target, sandboxPolicy) {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve();
    const { mode } = policy;
    if (mode === "danger-full-access") return target;
    if (mode === "read-only") {
      throw new FsError(`cannot write "${target.displayPath}": file access denied under read-only mode`, "FS_SANDBOX_DENIED");
    }
    const fresh = await this.resolve(target.displayPath);
    let contained = false;
    for (const root of writableRoots(policy)) {
      if (await isPathUnder(fresh.targetKey, root)) {
        contained = true;
        break;
      }
    }
    if (!contained) {
      throw new FsError(`cannot write "${target.displayPath}": file access denied under workspace-write mode`, "FS_SANDBOX_DENIED");
    }
    return fresh;
  }
};
var index_default = SandboxedFileSystem;
export {
  SandboxedFileSystem,
  index_default as default
};
//# sourceMappingURL=index.js.map
