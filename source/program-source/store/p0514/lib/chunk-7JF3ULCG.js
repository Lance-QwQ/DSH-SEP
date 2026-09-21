// src/fold.ts
import { z } from "zod";
import { SessionId } from "@deepseek-ai/dsh-session";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { FsTargetKey, FsVersion } from "@deepseek-ai/dsh-fs";

// src/ids.ts
function TaskId(id) {
  return id;
}
function TaskStepId(id) {
  return id;
}
function TaskOperationId(id) {
  return id;
}

// src/fold.ts
function foldTasks(events, maxBytes) {
  const tasks = /* @__PURE__ */ new Map();
  const ids = /* @__PURE__ */ new Set();
  const calls = /* @__PURE__ */ new Set();
  const revisions = /* @__PURE__ */ new Map();
  let bytes = 0;
  for (const event of events) {
    if (event.type !== "task/checkpoint-change") continue;
    bytes += Buffer.byteLength(JSON.stringify(event));
    if (bytes > maxBytes) throw new Error("TASK_LIMIT: retained task history exceeds byte limit");
    if (event.ignorable === true || "surfaceOp" in event || "sourceEventSeqs" in event) {
      throw new Error("TASK_SCHEMA: task changes must be required log-only events");
    }
    const change = changeSchema.parse(event.data);
    const revisionKey = `${change.taskId}:${change.revision}`;
    const encoded = JSON.stringify(change);
    const seen = revisions.get(revisionKey);
    if (seen !== void 0) {
      if (seen !== encoded) throw new Error("TASK_SCHEMA: conflicting revision redelivery");
      continue;
    }
    revisions.set(revisionKey, encoded);
    if (change.agentId !== change.sessionId) throw new Error("TASK_SCHEMA: Agent and Session identity disagree");
    const prior = tasks.get(change.taskId);
    if (change.action === "create") {
      if (prior !== void 0 || change.revision !== 1) throw new Error("TASK_SCHEMA: duplicate creation or invalid initial revision");
      if (new Set(change.steps.map((step) => step.id)).size !== change.steps.length) throw new Error("TASK_SCHEMA: duplicate step identity");
      for (const step of change.steps) {
        if (new Set(step.artifacts.map((file) => file.path)).size !== step.artifacts.length) throw new Error("TASK_SCHEMA: duplicate artifact path");
      }
      tasks.set(change.taskId, {
        id: change.taskId,
        revision: 1,
        sessionId: change.sessionId,
        agentId: change.agentId,
        project: change.project,
        objective: change.objective,
        steps: change.steps,
        operations: [],
        cancelled: false
      });
      continue;
    }
    if (prior === void 0 || change.revision !== prior.revision + 1 || prior.cancelled || change.sessionId !== prior.sessionId || change.agentId !== prior.agentId || change.project !== prior.project) {
      throw new Error("TASK_SCHEMA: changed scope, revision gap, absent or cancelled task");
    }
    if (change.action === "cancel") {
      prior.cancelled = true;
    } else if (change.action === "prepare") {
      const op = change.operation;
      const next = prior.steps.find((step) => !prior.operations.some((item) => item.stepId === step.id && item.state === "completed"));
      if (op.state !== "prepared" || op.resultCode !== "" || op.artifacts.length !== 0 || op.intentSeq !== event.seq || ids.has(op.id) || calls.has(op.innerCallId) || op.innerCallId === op.outerCallId || next?.id !== op.stepId || prior.operations.some((item) => item.state !== "completed")) {
        throw new Error("TASK_SCHEMA: invalid, duplicate, unordered or unresolved operation");
      }
      ids.add(op.id);
      calls.add(op.innerCallId);
      prior.operations.push(op);
    } else {
      const op = change.operation;
      const previous = prior.operations.find((item) => item.id === op.id);
      if (previous === void 0 || previous.state !== "prepared" || op.state === "prepared" || ["id", "stepId", "tool", "argumentsHash", "outerCallId", "innerCallId", "intentSeq"].some((key2) => previous[key2] !== op[key2])) {
        throw new Error("TASK_SCHEMA: invalid outcome identity or transition");
      }
      const step = prior.steps.find((item) => item.id === op.stepId);
      if (step === void 0) throw new Error("TASK_SCHEMA: operation step is absent");
      if (op.state === "completed") {
        if (op.resultCode !== "OK" || op.artifacts.length !== step.artifacts.length || step.artifacts.some((file, index) => {
          const actual = op.artifacts[index];
          return actual === void 0 || file.path !== actual.path || file.sha256 !== actual.sha256;
        })) {
          throw new Error("TASK_SCHEMA: completed operation lacks matching artifact evidence");
        }
      } else if (op.artifacts.length !== 0 || op.resultCode.length === 0) throw new Error("TASK_SCHEMA: uncertain outcome must preserve its result code");
      Object.assign(previous, op);
    }
    prior.revision = change.revision;
  }
  return tasks;
}
var text = z.string().min(1).max(4096).refine((value) => value.trim() === value);
var key = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/);
var hash = z.string().regex(/^[a-f0-9]{64}$/);
var relativePath = z.string().min(1).max(1024).refine((value) => value.trim() === value && !/^(?:[\\/]|[A-Za-z]:)/.test(value) && !value.split(/[\\/]/).some((part) => part === ".." || part === "" || part.includes(":")));
var artifact = z.strictObject({ path: relativePath, sha256: hash });
var stepSchema = z.strictObject({
  id: key.transform(TaskStepId),
  description: text,
  acceptance: text,
  artifacts: z.array(artifact).min(1).max(4)
});
var operation = z.strictObject({
  id: z.uuid().transform(TaskOperationId),
  stepId: key.transform(TaskStepId),
  tool: key,
  argumentsHash: hash,
  outerCallId: text.transform(ToolCallId),
  innerCallId: text.transform(ToolCallId),
  intentSeq: z.number().int().nonnegative(),
  state: z.enum(["prepared", "completed", "uncertain"]),
  resultCode: z.string().max(256),
  artifacts: z.array(artifact.extend({ version: text.transform(FsVersion), bytes: z.number().int().nonnegative() })).max(4)
});
var base = {
  schema: z.literal(1),
  taskId: z.uuid().transform(TaskId),
  revision: z.number().int().positive(),
  sessionId: text.transform(SessionId),
  agentId: text.transform(SessionId),
  project: text.transform(FsTargetKey)
};
var changeSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("create"), objective: text, steps: z.array(stepSchema).min(1).max(64) }),
  z.strictObject({ ...base, action: z.literal("prepare"), operation }),
  z.strictObject({ ...base, action: z.literal("settle"), operation }),
  z.strictObject({ ...base, action: z.literal("cancel") })
]);

export {
  TaskId,
  TaskStepId,
  TaskOperationId,
  foldTasks,
  stepSchema
};
//# sourceMappingURL=chunk-7JF3ULCG.js.map
