// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/diff.ts
import { structuredPatch } from "diff";
var DIFF_CONTEXT = 3;
function computeHunkDiffs(path, before, after) {
  const patch = structuredPatch("", "", before, after, void 0, void 0, { context: DIFF_CONTEXT });
  const diffs = [];
  for (const hunk of patch.hunks) {
    const oldLines = [];
    const newLines = [];
    for (const line of hunk.lines) {
      if (line.startsWith("\\")) continue;
      const text = line.slice(1);
      if (line.startsWith("-")) {
        oldLines.push(text);
      } else if (line.startsWith("+")) {
        newLines.push(text);
      } else {
        oldLines.push(text);
        newLines.push(text);
      }
    }
    diffs.push({ path, oldText: oldLines.length > 0 ? oldLines.join("\n") : null, newText: newLines.join("\n") });
  }
  return diffs;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/diff-worker.ts
function execute(input) {
  return { diffs: input.before === null ? [{ path: input.path, oldText: null, newText: input.after }] : computeHunkDiffs(input.path, input.before, input.after) };
}
export {
  execute
};
//# sourceMappingURL=diff-worker.js.map
