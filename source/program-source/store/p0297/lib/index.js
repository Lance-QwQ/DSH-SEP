// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/index.ts
import z from "@deepseek-ai/schemastery";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/read.ts
import { defineTool } from "@deepseek-ai/dsh-tools";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/read-render.ts
import { FsError } from "@deepseek-ai/dsh-fs";
var READ_MAX_LINE_LENGTH = 2e3;
var READ_MAX_BYTES = 50 * 1024;
function newAccumulator() {
  return { lines: [], totalLines: 0, outputBytes: 0, truncatedByBytes: false };
}
function truncateLine(line, maxLineLength) {
  return line.length > maxLineLength ? `${line.substring(0, maxLineLength)}... (line truncated to ${maxLineLength} chars)` : line;
}
function lineByteSize(line, currentLineCount) {
  return Buffer.byteLength(line, "utf8") + (currentLineCount > 0 ? 1 : 0);
}
function consumeLine(acc, rawLine, request) {
  acc.totalLines += 1;
  if (acc.truncatedByBytes || acc.totalLines < request.offset || acc.lines.length >= request.limit) return;
  const text = truncateLine(rawLine, request.maxLineLength);
  const bytes = lineByteSize(text, acc.lines.length);
  if (acc.outputBytes + bytes > request.maxBytes) {
    acc.truncatedByBytes = true;
    return;
  }
  acc.outputBytes += bytes;
  acc.lines.push({ number: acc.totalLines, text });
}
function stripCarriageReturn(line) {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
function finish(acc, request, displayPath) {
  if (!acc.truncatedByBytes && request.offset > acc.totalLines && !(acc.totalLines === 0 && request.offset === 1)) {
    throw new FsError(`offset ${request.offset} is out of range for "${displayPath}" (${acc.totalLines} lines)`, "FS_NOT_FOUND");
  }
  return { lines: acc.lines, totalLines: acc.totalLines, truncatedByBytes: acc.truncatedByBytes };
}
async function buildWindow(chunks, request, displayPath) {
  const acc = newAccumulator();
  const lineBufferCap = request.maxLineLength + 1;
  let lineBuffer = "";
  function appendToLineBuffer(segment) {
    if (lineBuffer.length >= lineBufferCap) return;
    lineBuffer += segment;
    if (lineBuffer.length > lineBufferCap) lineBuffer = lineBuffer.slice(0, lineBufferCap);
  }
  function flushLine() {
    consumeLine(acc, stripCarriageReturn(lineBuffer), request);
    lineBuffer = "";
  }
  for await (const chunk of chunks) {
    let startPos = 0;
    let newlinePos;
    while ((newlinePos = chunk.indexOf("\n", startPos)) !== -1) {
      appendToLineBuffer(chunk.slice(startPos, newlinePos));
      flushLine();
      startPos = newlinePos + 1;
    }
    appendToLineBuffer(chunk.slice(startPos));
  }
  if (lineBuffer.length > 0) flushLine();
  return finish(acc, request, displayPath);
}
function formatReadOutput(displayPath, outcome) {
  const endLine = outcome.lines.at(-1)?.number ?? Math.max(0, outcome.offset - 1);
  let footer;
  if (outcome.truncatedByBytes) {
    footer = `(Output capped. Showing lines ${outcome.offset}-${endLine}. Use offset=${endLine + 1} to continue.)`;
  } else if (endLine < outcome.totalLines) {
    footer = `(Showing lines ${outcome.offset}-${endLine} of ${outcome.totalLines}. Use offset=${endLine + 1} to continue.)`;
  } else {
    footer = `(End of file - total ${outcome.totalLines} lines)`;
  }
  const body = outcome.lines.length > 0 ? `${outcome.lines.map((line) => `${line.number}: ${line.text}`).join("\n")}

${footer}` : footer;
  return `<path>${displayPath}</path>
<type>file</type>
<content>
${body}
</content>`;
}
var LANG_BY_EXTENSION = {
  ts: "ts",
  tsx: "tsx",
  mts: "ts",
  cts: "ts",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  json: "json",
  jsonc: "json",
  py: "py",
  rb: "rb",
  go: "go",
  rs: "rs",
  java: "java",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  cxx: "cpp",
  cs: "cs",
  kt: "kotlin",
  swift: "swift",
  php: "php",
  sh: "sh",
  bash: "sh",
  zsh: "sh",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  md: "md",
  markdown: "md",
  mdx: "mdx",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  sql: "sql",
  xml: "xml",
  lua: "lua"
};
function langFromPath(path) {
  const base = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return void 0;
  const ext = base.slice(dot + 1).toLowerCase();
  return Object.hasOwn(LANG_BY_EXTENSION, ext) ? LANG_BY_EXTENSION[ext] : void 0;
}
function isFileTextLine(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { number, text } = value;
  return typeof number === "number" && Number.isInteger(number) && number >= 1 && typeof text === "string";
}
function readMetaFromMeta(meta) {
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return void 0;
  const { path, offset, lines, totalLines, lang } = meta;
  if (typeof path !== "string" || typeof totalLines !== "number" || typeof offset !== "number") return void 0;
  if (!Number.isInteger(offset) || offset < 1) return void 0;
  if (!Number.isInteger(totalLines) || totalLines < 0) return void 0;
  if (!Array.isArray(lines) || !lines.every(isFileTextLine)) return void 0;
  if (lang !== void 0 && typeof lang !== "string") return void 0;
  let previous = offset - 1;
  for (const { number } of lines) {
    if (number <= previous || number > totalLines) return void 0;
    previous = number;
  }
  return { path, offset, lines, totalLines, ...lang === void 0 ? {} : { lang } };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/read-target.ts
import { FsError as FsError2 } from "@deepseek-ai/dsh-fs";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/session-cwd.ts
function sessionCwd(exec) {
  return exec.agent?.session.header.cwd;
}
function sessionResolveOptions(exec, policyWorkspaceRoot) {
  const cwd = policyWorkspaceRoot ?? sessionCwd(exec);
  return {
    ...cwd !== void 0 ? { cwd } : {},
    signal: exec.signal
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/read-target.ts
async function resolveRegularReadTarget(ctx, exec, requestedPath) {
  const target = await ctx.fs.resolve(requestedPath, sessionResolveOptions(exec));
  const info = await ctx.fs.stat(target, exec.signal);
  if (info === void 0) {
    ctx.emit("fs/observed", target, { kind: "absent" }, exec);
    throw new FsError2(`cannot read "${target.displayPath}": not found`, "FS_NOT_FOUND");
  }
  if (info.type !== "file") {
    throw new FsError2(`cannot read "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE");
  }
  return { target, info };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/read.ts
var READ_LIMIT = 2e3;
var STREAM_MIN_SIZE = 10 * 1024 * 1024;
function parsePositiveInteger(value, name2) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name2} must be a positive integer`);
  }
  return value;
}
function parseReadArgs(args, maxLimit) {
  if (args.file_path.trim().length === 0) throw new Error("file_path must be a non-empty string");
  const offset = args.offset === void 0 ? 1 : parsePositiveInteger(args.offset, "offset");
  const limit = args.limit === void 0 ? maxLimit : parsePositiveInteger(args.limit, "limit");
  if (limit > maxLimit) throw new Error(`limit must be less than or equal to ${maxLimit}`);
  return { filePath: args.file_path, offset, limit };
}
function applyReadTool(ctx, caps) {
  ctx.systemPrompt.section({
    name: "tool:read",
    order: ctx.systemPrompt.getSectionOrder("TOOL_READ"),
    text: ({ scope }) => ctx.tools.get("read", scope) === void 0 ? "" : "Use the read tool \u2014 not shell commands like cat \u2014 to inspect text files. Results include line numbers. Use offset and limit to continue reading large files."
  });
  ctx.tools.register(defineTool({
    name: "read",
    description: "Read a UTF-8 text file and return line-numbered content.",
    parameters: {
      file_path: { type: "string", required: true, description: "Path to read, resolved by the filesystem backend." },
      offset: { type: "number", description: "1-based first line to return. Defaults to 1." },
      limit: { type: "number", description: `Maximum number of lines to return. Defaults to ${caps.limit}.` }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", required: true },
          offset: { type: "integer", required: true },
          lines: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                number: { type: "integer", required: true },
                text: { type: "string", required: true }
              }
            }
          },
          totalLines: { type: "integer", required: true }
        }
      },
      render: (args, value) => {
        const input = parseReadArgs(args, caps.limit);
        const endLine = value.lines.at(-1)?.number ?? Math.max(0, value.offset - 1);
        const truncatedByBytes = value.lines.length < input.limit && endLine < value.totalLines;
        return [{
          type: "text",
          text: formatReadOutput(value.path, {
            offset: value.offset,
            lines: value.lines,
            totalLines: value.totalLines,
            ...truncatedByBytes ? { truncatedByBytes: true } : {}
          })
        }];
      },
      // Project the structured window into persisted `meta` so a UI's read card
      // survives replay: the raw canonical output object is not on the wire, only
      // the model-facing text, from which the line/lang data cannot be recovered.
      presentationMeta: (_args, value) => {
        const lang = langFromPath(value.path);
        return {
          path: value.path,
          offset: value.offset,
          lines: value.lines.map(({ number, text }) => ({ number, text })),
          totalLines: value.totalLines,
          ...lang === void 0 ? {} : { lang }
        };
      }
    },
    // Observation races fail closed because guarded mutations re-check the version in-lock.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseReadArgs(args, caps.limit);
      const { target, info } = await resolveRegularReadTarget(ctx, exec, input.filePath);
      const chunks = info.size === void 0 || info.size >= caps.streamMinSize ? await ctx.fs.streamText(target, exec.signal) : [await ctx.fs.readText(target, exec.signal)];
      const window = await buildWindow(
        chunks,
        { offset: input.offset, limit: input.limit, maxLineLength: caps.maxLineLength, maxBytes: caps.maxBytes },
        target.displayPath
      );
      const outcome = {
        path: target.displayPath,
        offset: input.offset,
        lines: window.lines,
        totalLines: window.totalLines
      };
      ctx.emit("fs/observed", target, { kind: "present", version: info.version }, exec);
      return outcome;
    },
    // Result-time display: a `read` card carrying the structured line window a
    // capable UI renders as a line-numbered, syntax-highlighted view. The
    // structured data is narrowed from the persisted `meta` (replay-safe); the
    // envelope-stripped model-facing text rides along as `content` so a UI without
    // the read capability still shows the file text. A malformed or absent meta,
    // or a result whose text is not the read envelope, declines to `undefined`
    // (the generic fallback), never throwing on replay of obsolete logged output.
    presentResult(_args, result) {
      if (result.isError) return void 0;
      const meta = readMetaFromMeta(result.meta);
      if (meta === void 0) return void 0;
      const only = result.content.length === 1 ? result.content[0] : void 0;
      const text = only?.type === "text" ? only.text : void 0;
      if (text === void 0) return void 0;
      const body = /^<path>[^\n]*<\/path>\n<type>file<\/type>\n<content>\n([\s\S]*)\n<\/content>$/u.exec(text)?.[1];
      if (body === void 0) return void 0;
      return {
        card: "read",
        path: meta.path,
        offset: meta.offset,
        lines: meta.lines,
        totalLines: meta.totalLines,
        ...meta.lang === void 0 ? {} : { lang: meta.lang },
        content: [{ type: "text", text: body }]
      };
    },
    // Pure display: a generic card titled by the file with the read window appended (`Read
    // foo.txt (5 - 8)`), `read` kind (icon), and a follow-along location whose line is the
    // read's offset (defaulting to 1). The window reflects raw args, so an omitted limit keeps
    // the title bare instead of smuggling config into this pure presenter.
    presentCall(args) {
      const { offset, limit } = args;
      const window = limit !== void 0 && limit > 0 ? ` (${offset ?? 1} - ${(offset ?? 1) + limit - 1})` : offset !== void 0 ? ` (from line ${offset})` : "";
      return {
        card: "generic",
        title: `Read ${args.file_path}${window}`,
        kind: "read",
        locations: [{ path: args.file_path, line: offset ?? 1 }]
      };
    }
  }));
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/write.ts
import { defineTool as defineTool2 } from "@deepseek-ai/dsh-tools";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/diff.ts
import { structuredPatch } from "diff";
function isFileDiff(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { path, oldText, newText } = value;
  return typeof path === "string" && (oldText === null || typeof oldText === "string") && typeof newText === "string";
}
function diffsFromMeta(meta) {
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return void 0;
  const diffs = meta.diffs;
  if (!Array.isArray(diffs) || diffs.length === 0 || !diffs.every(isFileDiff)) return void 0;
  return diffs;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/diff-presentation.ts
import { createModuleExecutor } from "dsh-tool-worker";
var DEFAULT_LIMITS = {
  timeoutMs: 3e4,
  cancelGraceMs: 100,
  maxConcurrency: 2,
  maxInputBytes: 1048576,
  maxConfigBytes: 16384,
  maxOutputBytes: 1048576,
  maxLogBytes: 1048576,
  maxJsonDepth: 32,
  maxJsonNodes: 1e4,
  maxOldGenerationSizeMb: 128,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4
};
var preparedDiffSchema = {
  type: "object",
  additionalProperties: false,
  required: true,
  properties: {
    version: { type: "integer", const: 1, required: true },
    status: { type: "string", enum: ["ready", "unavailable", "not_requested"], required: true },
    reason: { type: "string", required: true },
    diffs: { type: "array", required: true, items: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string", required: true },
        oldText: { required: true, oneOf: [{ type: "string" }, { type: "null" }] },
        newText: { type: "string", required: true }
      }
    } }
  }
};
var commitSchema = {
  type: "object",
  additionalProperties: false,
  required: true,
  properties: {
    committed: { type: "boolean", const: true, required: true },
    path: { type: "string", required: true },
    operation: { type: "string", enum: ["create", "update"], required: true },
    version: { type: "string", required: true },
    mutationId: { type: "string" }
  }
};
function failureCode(error) {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && /^TOOL_WORKER_[A-Z_]+$/.test(error.code)) return error.code;
  return "DIFF_PREVIEW_FAILED";
}
function createDiffPresentation(ctx, config) {
  for (const key of Object.keys(config)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) throw new Error(`tool-fs: unknown diffWorker option ${key}`);
  }
  const renderer = createModuleExecutor(ctx, {
    ...DEFAULT_LIMITS,
    ...config,
    name: "fs_diff_preview",
    description: "Compute bounded file difference presentation",
    module: { url: new URL("./diff-worker.js", import.meta.url), exportName: "execute" },
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["path", "before", "after"],
      properties: { path: { type: "string" }, before: { oneOf: [{ type: "string" }, { type: "null" }] }, after: { type: "string" } }
    },
    output: { schema: { type: "object", additionalProperties: false, required: ["diffs"], properties: {
      diffs: { type: "array", items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "oldText", "newText"],
        properties: { path: { type: "string" }, oldText: { oneOf: [{ type: "string" }, { type: "null" }] }, newText: { type: "string" } }
      } }
    } } }
  });
  const receipts = /* @__PURE__ */ new Map();
  return {
    /** Record only after the provider has returned success, before callbacks or preview work. */
    record(exec, commit) {
      receipts.set(exec.token, { commit, unavailable: false });
    },
    /** Compute detached presentation; failure changes only the preview, never the file outcome. */
    async prepare(exec, input) {
      if (exec.parent !== void 0) return { version: 1, status: "not_requested", reason: "", diffs: [] };
      try {
        const result = await renderer.execute(input, { signal: exec.signal, callId: exec.callId, rootCallId: exec.rootCallId });
        return { version: 1, status: "ready", reason: "", diffs: result.diffs };
      } catch (error) {
        const receipt = receipts.get(exec.token);
        if (receipt) receipt.unavailable = true;
        return { version: 1, status: "unavailable", reason: failureCode(error), diffs: [] };
      }
    },
    /** Preserve known side effects even when the registry selects cancellation or pipeline error. */
    finalizeContent(exec, result) {
      const receipt = receipts.get(exec.token);
      receipts.delete(exec.token);
      if (!receipt || !result.isError && !receipt.unavailable) return void 0;
      return [...result.content, { type: "text", text: `File mutation committed: ${JSON.stringify(receipt.commit)}. ` + (receipt.unavailable ? "Difference preview unavailable. " : "") + "Do not repeat this mutation solely because the call was cancelled or its response failed. Read the file or inspect its recovery record before further changes." }];
    }
  };
}
function preparedDiffMeta(presentation, commit) {
  return {
    diffs: presentation.diffs.map(({ path, oldText, newText }) => ({ path, oldText, newText })),
    diffPresentation: { version: presentation.version, status: presentation.status, reason: presentation.reason },
    commit: { ...commit }
  };
}
function hasPreparedDiffMeta(meta) {
  return typeof meta === "object" && meta !== null && "diffPresentation" in meta;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/error.ts
import { FsError as FsError3 } from "@deepseek-ai/dsh-fs";
function remediateFsError(error, displayPath) {
  if (!(error instanceof FsError3)) return error;
  if (error.code === "FS_NOT_OBSERVED") {
    return new FsError3(
      `cannot modify "${displayPath}": file has not been read \u2014 read the file, then retry`,
      error.code,
      { cause: error }
    );
  }
  if (error.code === "FS_STALE_VERSION") {
    return new FsError3(`${error.message} \u2014 re-read the file, then retry`, error.code, { cause: error });
  }
  return error;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/write.ts
function parseWriteArgs(args) {
  if (args.file_path.trim().length === 0) throw new Error("file_path must be a non-empty string");
  return { filePath: args.file_path, content: args.content };
}
function formatWriteOutput(displayPath, outcome) {
  const verb = outcome.operation === "create" ? "Created" : "Updated";
  return `<path>${displayPath}</path>
<type>file</type>
<content>
${verb} file
</content>`;
}
function applyWriteTool(ctx, sandbox, diff) {
  ctx.systemPrompt.section({
    name: "tool:write",
    order: ctx.systemPrompt.getSectionOrder("TOOL_WRITE"),
    text: ({ scope }) => ctx.tools.get("write", scope) === void 0 ? "" : "Use the write tool to create files or completely replace file contents. Existing files are overwritten, so read an existing file first (the default fs-observation-policy requires it)" + (ctx.tools.get("edit", scope) === void 0 ? "" : " and prefer edit for targeted changes") + "."
  });
  ctx.tools.register(defineTool2({
    name: "write",
    description: "Create or fully replace a UTF-8 text file.",
    parameters: {
      file_path: { type: "string", required: true, description: "Path to write, resolved by the filesystem backend." },
      content: { type: "string", required: true, description: "Full UTF-8 text content to write." },
      ...sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {}
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", required: true },
          operation: { type: "string", required: true, enum: ["create", "update"] },
          before: {
            required: true,
            oneOf: [
              { type: "string" },
              { type: "null" }
            ]
          },
          after: { type: "string", required: true },
          presentation: preparedDiffSchema,
          commit: commitSchema
        }
      },
      render: (_args, value) => [{ type: "text", text: formatWriteOutput(value.path, value) }],
      presentationMeta: (_args, value) => ({ ...preparedDiffMeta(value.presentation, value.commit), operation: value.operation })
    },
    async execute(args, exec) {
      const input = parseWriteArgs(args);
      const sandboxPolicy = await sandbox.resolvePolicy("write", args, exec);
      const target = await ctx.fs.resolve(input.filePath, sessionResolveOptions(exec, sandboxPolicy?.workspaceRoot));
      const intent = await ctx.waterfall("fs/write-intent", target, exec, () => void 0);
      let outcome;
      try {
        outcome = await ctx.fs.writeText(target, input.content, intent, exec.signal, sandboxPolicy);
      } catch (error) {
        throw remediateFsError(sandbox.mapError(error, sandboxPolicy), target.displayPath);
      }
      const commit = {
        committed: true,
        path: target.displayPath,
        operation: outcome.operation,
        version: outcome.version,
        ...outcome.mutationId === void 0 ? {} : { mutationId: outcome.mutationId }
      };
      diff.record(exec, commit);
      ctx.emit("fs/observed", target, { kind: "present", version: outcome.version }, exec);
      const presentation = await diff.prepare(exec, { path: args.file_path, before: outcome.before, after: outcome.after });
      return {
        path: target.displayPath,
        operation: outcome.operation,
        before: outcome.before,
        after: outcome.after,
        presentation,
        commit
      };
    },
    finalizeContent: diff.finalizeContent,
    // Pure display: a diff card. A call-time presenter has no access to prior
    // file content, so `oldText: null` also represents an overwrite here.
    presentCall(args) {
      return {
        card: "diff",
        title: `Write ${args.file_path}`,
        diffs: [{ path: args.file_path, oldText: null, newText: args.content }],
        locations: [{ path: args.file_path }]
      };
    },
    // Result-time display repeats the diff because completed views replace the
    // pending view. Overwrites use applied metadata; creates and identical
    // overwrites use the replay-safe args fallback.
    presentResult(args, result) {
      if (result.isError) return void 0;
      if (hasPreparedDiffMeta(result.meta)) {
        const prepared = diffsFromMeta(result.meta);
        return prepared === void 0 ? void 0 : { card: "diff", title: "Write " + args.file_path, diffs: prepared };
      }
      const diffs = diffsFromMeta(result.meta) ?? [{ path: args.file_path, oldText: null, newText: args.content }];
      return { card: "diff", title: `Write ${args.file_path}`, diffs };
    }
  }));
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/edit.ts
import { defineTool as defineTool3 } from "@deepseek-ai/dsh-tools";
function parseEditArgs(args) {
  if (args.file_path.trim().length === 0) throw new Error("file_path must be a non-empty string");
  if (args.old_string.length === 0) throw new Error("old_string must be a non-empty string");
  if (args.old_string === args.new_string) throw new Error("old_string and new_string must differ");
  return {
    filePath: args.file_path,
    oldString: args.old_string,
    newString: args.new_string,
    replaceAll: args.replace_all ?? false
  };
}
function formatEditOutput(displayPath, replaceAll) {
  return replaceAll ? `The file ${displayPath} has been updated. All occurrences were successfully replaced.` : `The file ${displayPath} has been updated successfully.`;
}
function applyEditTool(ctx, sandbox, diff) {
  ctx.systemPrompt.section({
    name: "tool:edit",
    order: ctx.systemPrompt.getSectionOrder("TOOL_EDIT"),
    text: ({ scope }) => ctx.tools.get("edit", scope) === void 0 ? "" : "Use the edit tool for targeted changes to existing UTF-8 text files. It replaces literal old_string with new_string; by default old_string must appear exactly once. If old_string appears multiple times, provide a more specific old_string or set replace_all to true. Read the file first (the default fs-observation-policy requires it), unless you just created or edited it in this session."
  });
  ctx.tools.register(defineTool3({
    name: "edit",
    description: "Edit an existing UTF-8 text file by replacing literal text.",
    parameters: {
      file_path: { type: "string", required: true, description: "Path to edit, resolved by the filesystem backend." },
      old_string: { type: "string", required: true, description: "Literal text to replace. Must match exactly." },
      new_string: { type: "string", required: true, description: "Literal replacement text. Use an empty string to delete the match." },
      replace_all: { type: "boolean", description: "Replace all matches. Defaults to false; when false, old_string must appear exactly once." },
      ...sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {}
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", required: true },
          before: { type: "string", required: true },
          after: { type: "string", required: true },
          presentation: preparedDiffSchema,
          commit: commitSchema
        }
      },
      render: (args, value) => [{
        type: "text",
        text: formatEditOutput(value.path, args.replace_all ?? false)
      }],
      presentationMeta: (_args, value) => preparedDiffMeta(value.presentation, value.commit)
    },
    async execute(args, exec) {
      const input = parseEditArgs(args);
      const sandboxPolicy = await sandbox.resolvePolicy("edit", args, exec);
      const target = await ctx.fs.resolve(input.filePath, sessionResolveOptions(exec, sandboxPolicy?.workspaceRoot));
      let outcome;
      try {
        const intent = await ctx.waterfall("fs/edit-intent", target, exec, () => void 0);
        outcome = await ctx.fs.editText(
          target,
          { oldString: input.oldString, newString: input.newString, replaceAll: input.replaceAll },
          intent,
          exec.signal,
          sandboxPolicy
        );
      } catch (error) {
        throw remediateFsError(sandbox.mapError(error, sandboxPolicy), target.displayPath);
      }
      const commit = {
        committed: true,
        path: target.displayPath,
        operation: "update",
        version: outcome.version,
        ...outcome.mutationId === void 0 ? {} : { mutationId: outcome.mutationId }
      };
      diff.record(exec, commit);
      ctx.emit("fs/observed", target, { kind: "present", version: outcome.version }, exec);
      const presentation = await diff.prepare(exec, { path: args.file_path, before: outcome.before, after: outcome.after });
      return {
        path: target.displayPath,
        before: outcome.before,
        after: outcome.after,
        presentation,
        commit
      };
    },
    finalizeContent: diff.finalizeContent,
    // Pure display: a diff card of the literal replacement (old_string → new_string), derived
    // from the call args. `oldText: old_string || null` matches claude-agent-acp's Edit arm;
    // new_string is a required arg here, so it maps straight to newText.
    presentCall(args) {
      return {
        card: "diff",
        title: `Edit ${args.file_path}`,
        diffs: [{ path: args.file_path, oldText: args.old_string || null, newText: args.new_string }],
        locations: [{ path: args.file_path }]
      };
    },
    // Applied metadata replaces the call-time snippet; errors or malformed replay metadata use
    // the generic result rendering.
    presentResult(args, result) {
      if (result.isError) return void 0;
      const diffs = diffsFromMeta(result.meta);
      if (diffs === void 0) return void 0;
      return { card: "diff", title: `Edit ${args.file_path}`, diffs };
    }
  }));
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/read-image.ts
import { basename, extname } from "node:path";
import { AttachmentError, AttachmentId } from "@deepseek-ai/dsh-attachment";
import { defineTool as defineTool4 } from "@deepseek-ai/dsh-tools";
var IMAGE_EXTENSIONS = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
var PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
var JPEG_SIGNATURE = [255, 216, 255];
function matchesBytes(data, offset, expected) {
  if (data.byteLength < offset + expected.length) return false;
  return expected.every((byte, index) => data[offset + index] === byte);
}
function matchesAscii(data, offset, value) {
  if (data.byteLength < offset + value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (data[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}
function sniffImageMediaType(data) {
  if (matchesBytes(data, 0, PNG_SIGNATURE)) return "image/png";
  if (matchesBytes(data, 0, JPEG_SIGNATURE)) return "image/jpeg";
  if (matchesAscii(data, 0, "GIF87a") || matchesAscii(data, 0, "GIF89a")) return "image/gif";
  if (matchesAscii(data, 0, "RIFF") && matchesAscii(data, 8, "WEBP")) return "image/webp";
  return void 0;
}
var IMAGE_VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: true,
  properties: {
    attachmentId: { type: "string", required: true },
    mediaType: { type: "string", enum: ["image/png", "image/jpeg", "image/webp", "image/gif"], required: true },
    bytes: { type: "integer", required: true },
    width: { type: "integer", required: true },
    height: { type: "integer", required: true },
    name: { type: "string" },
    originalDimensions: {
      type: "object",
      additionalProperties: false,
      properties: {
        width: { type: "integer", required: true },
        height: { type: "integer", required: true }
      }
    }
  }
};
function imageMediaTypeForPath(filePath) {
  return IMAGE_EXTENSIONS[extname(filePath).toLowerCase()];
}
async function assertImageCapableRoute(ctx, exec, requestedPath) {
  const routed = exec.agent?.session.requestHeader()?.config;
  const provider = routed?.provider ?? exec.agent?.options.provider;
  const model = routed?.model ?? exec.agent?.options.model;
  const llm = ctx.get("llm");
  if (provider === void 0 || model === void 0 || llm === void 0) {
    throw new Error(`cannot read "${requestedPath}" as an image: the current model route could not be resolved`);
  }
  const active = await llm.resolveModelInfo(provider, model, exec.signal);
  if (active.inputModalities === void 0 || !active.inputModalities.includes("image")) {
    throw new Error(`cannot read "${requestedPath}" as an image: model "${model}" does not declare image input; switch to an image-capable model to read images`);
  }
}
function assertDeploymentAccepts(attachments, mediaType, displayPath) {
  if (!attachments.imageLimits.mediaTypes.includes(mediaType)) {
    throw new Error(`cannot read "${displayPath}": ${mediaType} images are not accepted by this deployment`);
  }
}
function imageRefFromValue(image) {
  return {
    attachmentId: AttachmentId(image.attachmentId),
    mediaType: image.mediaType,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    ...image.name === void 0 ? {} : { name: image.name },
    ...image.originalDimensions === void 0 ? {} : {
      originalDimensions: { ...image.originalDimensions }
    }
  };
}
function formatImageReadOutput(displayPath, image) {
  let scaled = "";
  if (image.originalDimensions !== void 0) {
    const x = (image.originalDimensions.width / image.width).toFixed(2);
    const y = (image.originalDimensions.height / image.height).toFixed(2);
    const advice = x === y ? `multiply coordinates by ${x}` : `multiply x coordinates by ${x} and y coordinates by ${y}`;
    scaled = ` (downscaled from ${image.originalDimensions.width}x${image.originalDimensions.height} px; ${advice} to locate features in the original file)`;
  }
  return `<path>${displayPath}</path>
<type>image</type>
<content>
${image.mediaType} image, ${image.width}x${image.height} px, ${image.bytes} bytes${scaled}
</content>`;
}
function imageReadContent(value) {
  return [
    { type: "text", text: formatImageReadOutput(value.path, value.image) },
    { type: "image", attachment: imageRefFromValue(value.image) }
  ];
}
function applyReadImageTool(ctx) {
  ctx.tools.register(defineTool4({
    name: "read_image",
    description: "Read a PNG/JPEG/WebP/GIF file and return the image itself. A path without a file extension is accepted; the format is detected from the file content, so normalized attachment paths can be passed directly without copying or renaming. Harness validates and downscales large supported images before the next model request, so use this tool directly instead of installing image libraries or creating thumbnails merely to inspect an image. Independent files may be read concurrently in small batches. Requires the current model to accept image input.",
    parameters: {
      file_path: { type: "string", required: true, description: "Path to the image file, resolved by the filesystem backend." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", required: true },
          image: IMAGE_VALUE_SCHEMA
        }
      },
      render: (_args, value) => imageReadContent(value),
      // Persist the resolved path only. The attachment reference is NOT copied
      // here: the settled `content` already carries the image block with the
      // complete reference, so a second copy would keep two records of one fact —
      // and a `tools/post-execute` hook that legitimately replaces the content
      // would leave the stale copy behind, showing an image the result no longer
      // returns. The path needs its own structured record because the content
      // carries it only as model-facing envelope text, which the client does not
      // parse.
      presentationMeta: (_args, value) => ({ path: value.path })
    },
    // Content-addressed attachment writes are idempotent, so concurrent reads
    // of the same file cannot conflict.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (args.file_path.trim().length === 0) throw new Error("file_path must be a non-empty string");
      const extension = extname(args.file_path).toLowerCase();
      const declared = imageMediaTypeForPath(args.file_path);
      if (declared === void 0 && extension !== "") {
        throw new Error(`cannot read "${args.file_path}": the ${extension} extension does not declare a supported image format; read_image accepts PNG/JPEG/WebP/GIF files, including extension-less files in those formats`);
      }
      const attachments = ctx.get("attachments");
      if (attachments === void 0) {
        throw new Error(`cannot read "${args.file_path}" as an image: no attachment service is mounted`);
      }
      if (declared !== void 0) assertDeploymentAccepts(attachments, declared, args.file_path);
      await assertImageCapableRoute(ctx, exec, args.file_path);
      const { target, info } = await resolveRegularReadTarget(ctx, exec, args.file_path);
      const byteCap = Math.min(attachments.imageLimits.maxImageBytes, attachments.imageLimits.maxMessageImageBytes);
      const data = await ctx.fs.readBytes(target, exec.signal, byteCap);
      const mediaType = declared ?? sniffImageMediaType(data);
      if (mediaType === void 0) {
        throw new Error(`cannot read "${target.displayPath}": the file content is not a supported image format; read_image accepts PNG/JPEG/WebP/GIF`);
      }
      if (declared === void 0) assertDeploymentAccepts(attachments, mediaType, target.displayPath);
      let ref;
      try {
        ref = await attachments.saveImage({ data, mediaType, name: basename(target.displayPath) });
      } catch (error) {
        if (!(error instanceof AttachmentError)) throw error;
        if (error.code === "IMAGE_DIMENSION_TOO_LARGE") {
          throw new Error(
            `cannot read "${target.displayPath}": at least one image side exceeds the ${attachments.imageLimits.maxImageDimension}px limit; downscale the image and read the smaller copy`,
            { cause: error }
          );
        }
        if (error.code === "IMAGE_TOO_MANY_PIXELS") {
          throw new Error(
            `cannot read "${target.displayPath}": the image exceeds the ${attachments.imageLimits.maxImagePixels}-pixel decoded-size limit; downscale the image and read the smaller copy`,
            { cause: error }
          );
        }
        if (error.code === "IMAGE_TOO_LARGE") {
          throw new Error(
            `cannot read "${target.displayPath}": the image cannot be stored within the deployment's byte limits; downscale the image and read the smaller copy`,
            { cause: error }
          );
        }
        if (error.code === "ATTACHMENT_WRITE_FAILED" && /16-bit PNG/iu.test(error.message)) {
          throw new Error(
            `cannot read "${target.displayPath}": the 16-bit PNG could not be converted to the normalized 8-bit sRGB form; convert it to an 8-bit PNG/JPEG/WebP and retry`,
            { cause: error }
          );
        }
        if (error.code === "INVALID_IMAGE" && declared === void 0) {
          throw new Error(
            `cannot read "${target.displayPath}": the bytes do not decode as a supported PNG/JPEG/WebP/GIF image; the file may be truncated or corrupt`,
            { cause: error }
          );
        }
        if (error.code !== "IMAGE_TYPE_MISMATCH") throw error;
        if (declared === void 0) {
          throw new Error(
            `cannot read "${target.displayPath}": the file signature claims ${mediaType}, but the bytes decode as a different image format; the file may be corrupt`,
            { cause: error }
          );
        }
        throw new Error(
          `cannot read "${target.displayPath}": the ${extension} extension declares ${mediaType}, but the bytes use a different image format; rename the file to match its actual format if it is PNG/JPEG/WebP/GIF, or convert it to one of those formats`,
          { cause: error }
        );
      }
      ctx.emit("fs/observed", target, { kind: "present", version: info.version }, exec);
      const value = {
        path: target.displayPath,
        image: {
          attachmentId: ref.attachmentId,
          mediaType: ref.mediaType,
          bytes: ref.bytes,
          width: ref.width,
          height: ref.height,
          ...ref.name === void 0 ? {} : { name: ref.name },
          ...ref.originalDimensions === void 0 ? {} : {
            originalDimensions: { ...ref.originalDimensions }
          }
        }
      };
      return value;
    },
    // Pure display: a generic card in the read family with a follow-along
    // location on the image file.
    presentCall(args) {
      return {
        card: "generic",
        title: `Read image ${args.file_path}`,
        kind: "read",
        locations: [{ path: args.file_path }]
      };
    }
  }));
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/sandbox.ts
import { ESCALATION_TARGETS, approveEscalation, escalationHintMarker, sandboxDenialMarker, validateEscalationArgs } from "@deepseek-ai/dsh-sandbox";
import { FsError as FsError4 } from "@deepseek-ai/dsh-fs";
var FsSandboxController = class {
  constructor(ctx) {
    this.ctx = ctx;
    const defaultMode = ctx.fs.sandboxMode;
    this.escalationModes = defaultMode === void 0 ? [] : ESCALATION_TARGETS;
    this.policy = defaultMode === void 0 ? void 0 : ctx.get("sandboxPolicy");
    if (defaultMode !== void 0 && this.policy === void 0) {
      throw new Error("tool-fs: the mounted filesystem confines but ctx.sandboxPolicy is missing");
    }
  }
  ctx;
  /** The escalation targets this composition advertises (`[]` when no confining backend is mounted). */
  escalationModes;
  /** Shared per-session policy resolver, required by a confining backend. */
  policy;
  /**
   * The escalation schema fields for a mutating tool's `parameters`. Call it
   * only under a confining backend (guard on {@link escalationModes}); the
   * enum pins the closed target vocabulary, the strict-wider check happens per
   * call at execution.
   * @returns the two escalation parameter specs.
   */
  schemaFields() {
    return {
      sandbox_permissions: {
        type: "string",
        enum: [...this.escalationModes],
        description: "The wider sandbox mode this file operation needs. Only valid as a one-shot retry of an operation the sandbox just denied; requires justification and user approval."
      },
      justification: {
        type: "string",
        description: "Required with sandbox_permissions: one sentence for the user explaining why this exact file operation needs the wider access."
      }
    };
  }
  /**
   * The policy to stamp onto this mutation: an approved escalation grant (a
   * strictly wider retry resolved through `ctx.approval` before anything
   * executes), else the session's standing mode. Repeating the standing mode
   * requires no approval. The calling session's cwd is
   * always carried as the workspace root. Validates the escalation argument
   * pairing first.
   * @param toolName - the mutating tool's name, for the approval audit trail.
   * @param args - the call's escalation arguments.
   * @param exec - the tool-execution context (agent, callId, signal).
   * @returns the policy to pass to the mutation, or undefined for an
   *   unsandboxed backend.
   */
  async resolvePolicy(toolName, args, exec) {
    validateEscalationArgs(args.sandbox_permissions, args.justification);
    const standingPolicy = this.policy?.resolve({ ...exec.agent ? { session: exec.agent.session } : {} });
    if (args.sandbox_permissions === void 0 || args.justification === void 0) {
      return standingPolicy;
    }
    if (this.escalationModes.length === 0) {
      throw new Error("sandbox_permissions is not available in this composition (no sandboxing filesystem to escalate)");
    }
    const policy = standingPolicy;
    const approvedMode = await approveEscalation(
      { requestedMode: args.sandbox_permissions, justification: args.justification, effectiveMode: policy.mode, subject: "operation" },
      {
        approver: this.ctx.get("approval"),
        agent: exec.agent,
        callId: exec.callId,
        toolName,
        signal: exec.signal
      }
    );
    return { ...policy, mode: approvedMode };
  }
  /**
   * Map a thrown provider error for the model: a `FS_SANDBOX_DENIED` becomes a
   * `FsError` whose text is the shared `[sandbox: …]` denial marker plus the
   * same-turn escalation hint, so a policy denial reads identically to bash's
   * WHILE keeping the structured `FS_SANDBOX_DENIED` code — `ToolRuntime`
   * populates `result.error` only for `HarnessError` instances, so a plain
   * `Error` would strip the code retry/observers key off. Any other error
   * passes through unchanged. A `FS_SANDBOX_DENIED` only arises under a
   * confining backend, which always advertises the escalation fields, so the
   * hint always applies here.
   * @param error - the error thrown by the mutation.
   * @param policy - the policy stamped onto the call (names the mode in the marker).
   * @returns the error to throw — the marker `FsError` for a sandbox denial, else the original.
   */
  mapError(error, policy) {
    if (!(error instanceof FsError4) || error.code !== "FS_SANDBOX_DENIED") return error;
    const mode = policy.mode;
    return new FsError4(`${sandboxDenialMarker(mode)}
${escalationHintMarker("operation")}`, "FS_SANDBOX_DENIED", { cause: error });
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/manage.ts
import { defineTool as defineTool5 } from "@deepseek-ai/dsh-tools";
import { FsError as FsError5 } from "@deepseek-ai/dsh-fs";
function applyManagedFileTools(ctx, sandbox) {
  if (ctx.fs.recoveryStatus === "unsupported") return;
  ctx.systemPrompt.context({ name: "file:recovery", order: 112, text: () => `File recovery: ${ctx.fs.recoveryStatus}. Standard file writes and managed move/delete require configured recovery storage. Recovery protects ordinary single-link files through the file tools. Shell commands and plugins using native file APIs are outside this backup protection.` });
  ctx.effect(() => ctx.tools.register(defineTool5({
    name: "file_manage",
    description: "Move or delete one previously read ordinary file with a durable recovery record. Move requires an absent destination. Directories, hard links and unsupported metadata are refused.",
    parameters: {
      action: { type: "string", required: true, enum: ["move", "delete"] },
      file_path: { type: "string", required: true, description: "Source file inside the current workspace." },
      destination: { type: "string", description: "Required only for move: a new file path inside this workspace." },
      ...sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {}
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args, exec) {
      if (args.action !== "move" && args.action !== "delete") throw new Error("action must be move or delete");
      if (!args.file_path.trim()) throw new Error("file_path must be a non-empty string");
      if (args.action === "move" !== (typeof args.destination === "string" && args.destination.trim().length > 0)) {
        throw new Error("destination is required for move and must be omitted for delete");
      }
      const policy = await sandbox.resolvePolicy("file_manage", args, exec);
      const source = await ctx.fs.resolve(args.file_path, sessionResolveOptions(exec, policy?.workspaceRoot));
      const observed = await ctx.waterfall("fs/edit-intent", source, exec, () => void 0);
      const info = await ctx.fs.stat(source, exec.signal);
      if (info === void 0) throw new FsError5("managed source does not exist", "FS_NOT_FOUND");
      const expected = observed ?? { version: info.version };
      const destinationPath = args.destination;
      const destination = args.action === "move" ? await ctx.fs.resolve(destinationPath, sessionResolveOptions(exec, policy?.workspaceRoot)) : void 0;
      const result = destination === void 0 ? await ctx.fs.removeFile(source, expected, exec.signal, policy) : await ctx.fs.moveFile(source, destination, expected, exec.signal, policy);
      ctx.emit("fs/observed", source, { kind: "absent" }, exec);
      return JSON.stringify(result);
    },
    presentCall: (args) => ({ card: "generic", title: `${args.action} ${args.file_path}`, kind: "execute", locations: [{ path: args.file_path }] })
  })));
  ctx.effect(() => ctx.tools.register(defineTool5({
    name: "file_recovery",
    description: "List this workspace\u2019s file recovery records or explicitly restore one. Restore stops if current files changed and preserves both the new data and the backup.",
    parameters: {
      action: { type: "string", required: true, enum: ["list", "restore"] },
      mutation_id: { type: "string", description: "The recorded mutation ID; required for restore." },
      ...sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {}
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args, exec) {
      if (args.action !== "list" && args.action !== "restore") throw new Error("action must be list or restore");
      if (args.action === "restore" && !args.mutation_id?.trim()) throw new Error("mutation_id is required for restore");
      if (args.action === "list" && args.sandbox_permissions !== void 0) throw new Error("listing recovery metadata does not support escalation");
      const policy = await sandbox.resolvePolicy("file_recovery", args, exec);
      return JSON.stringify(args.action === "list" ? { status: ctx.fs.recoveryStatus, ...await ctx.fs.inspectRecovery(policy) } : await ctx.fs.restoreMutation(args.mutation_id, exec.signal, policy));
    },
    presentCall: (args) => ({ card: "generic", title: `file recovery ${args.action}`, kind: args.action === "list" ? "read" : "execute" })
  })));
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/tool-fs/src/index.ts
var name = "tool-fs";
var inject = ["tools", "fs", "systemPrompt"];
var Config = z.object({
  diffWorker: z.dict(z.number()).default({}),
  readLimit: z.number().default(READ_LIMIT),
  readMaxLineLength: z.number().default(READ_MAX_LINE_LENGTH),
  readMaxBytes: z.number().default(READ_MAX_BYTES),
  readStreamMinSize: z.number().default(STREAM_MIN_SIZE)
});
function assertPositiveInteger(name2, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`tool-fs: ${name2} must be a positive integer`);
  }
}
function apply(ctx, config) {
  const resolved = config;
  assertPositiveInteger("readLimit", resolved.readLimit);
  assertPositiveInteger("readMaxLineLength", resolved.readMaxLineLength);
  assertPositiveInteger("readMaxBytes", resolved.readMaxBytes);
  assertPositiveInteger("readStreamMinSize", resolved.readStreamMinSize);
  const diff = createDiffPresentation(ctx, resolved.diffWorker);
  applyReadTool(ctx, {
    limit: resolved.readLimit,
    maxLineLength: resolved.readMaxLineLength,
    maxBytes: resolved.readMaxBytes,
    streamMinSize: resolved.readStreamMinSize
  });
  ctx.inject(["attachments"], (imageCtx) => {
    applyReadImageTool(imageCtx);
  });
  const sandbox = new FsSandboxController(ctx);
  applyWriteTool(ctx, sandbox, diff);
  applyEditTool(ctx, sandbox, diff);
  applyManagedFileTools(ctx, sandbox);
}
export {
  Config,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
