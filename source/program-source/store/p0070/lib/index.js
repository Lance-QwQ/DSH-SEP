// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs/src/index.ts
import { Service } from "@deepseek-ai/cordis";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs/src/types.ts
import { HarnessError } from "@deepseek-ai/dsh-llm";
function FsTargetKey(key) {
  return key;
}
function FsVersion(v) {
  return v;
}
var FsError = class extends HarnessError {
  code;
  constructor(message, code, options) {
    super(message, code, options);
    this.code = code;
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs/src/index.ts
var FileSystem = class extends Service {
  constructor(ctx) {
    super(ctx, "fs");
  }
  /**
   * The sandbox mode this backend enforces on mutations BY DEFAULT, or
   * `undefined` when it does not confine at all — the capability fact the tool
   * layer reads to advertise the escalation fields honestly (mirrors
   * `ShellExecutor.sandboxMode`). The base class and the bare local backend
   * report `undefined`; a sandboxing backend (`@deepseek-ai/dsh-fs-sandbox`)
   * overrides it with the deployment default. A session override may make the
   * effective mode narrower or wider, so strict escalation widening is checked
   * per call rather than encoded in this default-relative fact.
   * @returns the configured default mode of a sandboxing backend; `undefined`
   *   for a backend that never confines.
   */
  get sandboxMode() {
    return void 0;
  }
  /** Current support/configuration status; ready does not certify storage health.
   * @returns whether protected mutations are supported and explicitly configured.
   */
  get recoveryStatus() {
    return "unsupported";
  }
  /** Move one ordinary file without replacing its destination, retaining a durable preimage.
   * @param _source - resolved ordinary source file.
   * @param _destination - resolved absent destination on the supported volume.
   * @param _expected - optional observed source version.
   * @param _signal - cancellation before publication.
   * @param _policy - current mode and trusted workspace.
   * @returns durable operation metadata; unsupported providers reject explicitly.
   */
  moveFile(_source, _destination, _expected, _signal, _policy) {
    return Promise.reject(new FsError("this filesystem provider does not support recoverable move", "FS_PROTECTION_UNAVAILABLE"));
  }
  /** Remove one ordinary file into recovery storage; excludes directory recursion.
   * @param _target - resolved source file.
   * @param _expected - optional observed source version.
   * @param _signal - cancellation before relocation.
   * @param _policy - current mode and trusted workspace.
   * @returns durable operation metadata; unsupported providers reject explicitly.
   */
  removeFile(_target, _expected, _signal, _policy) {
    return Promise.reject(new FsError("this filesystem provider does not support recoverable delete", "FS_PROTECTION_UNAVAILABLE"));
  }
  /** Restore after checking current scope, file versions and verified preimages.
   * @param _mutationId - durable operation identifier, validated by the provider.
   * @param _signal - cancellation before publication.
   * @param _policy - current mode and trusted workspace.
   * @returns metadata for the restored operation; conflicting current data remains intact.
   */
  restoreMutation(_mutationId, _signal, _policy) {
    return Promise.reject(new FsError("this filesystem provider does not support recovery", "FS_PROTECTION_UNAVAILABLE"));
  }
  /** List verified metadata for the current workspace; unavailable or damaged storage is an error.
   * @param _policy - current mode and trusted workspace.
   * @returns durable operation summaries without preimage contents.
   */
  listMutations(_policy) {
    return Promise.reject(new FsError("this filesystem provider does not support recovery", "FS_PROTECTION_UNAVAILABLE"));
  }
  /** Inspect records and journal problems without modifying or clearing recovery storage.
   * @param policy - current mode and trusted workspace.
   * @returns verified operations, explicit issues and whether journal damage blocks mutations.
   */
  async inspectRecovery(policy) {
    return { operations: await this.listMutations(policy), issues: [], blocked: false };
  }
  /**
   * Map an absolute path from the harness host into this filesystem's
   * execution world when both paths identify the same file. The base provider
   * exposes no mapping; host-backed or explicitly shared backends override it.
   * @param hostPath - absolute path in the harness host filesystem.
   * @returns the process path for the same file, or undefined when this
   *   execution world cannot read that host file.
   */
  processPathFromHostPath(hostPath) {
    void hostPath;
    return void 0;
  }
};
var index_default = FileSystem;
export {
  FileSystem,
  FsError,
  FsTargetKey,
  FsVersion,
  index_default as default
};
//# sourceMappingURL=index.js.map
