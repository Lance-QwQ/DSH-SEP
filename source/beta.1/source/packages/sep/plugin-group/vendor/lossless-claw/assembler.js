import { createHash } from "node:crypto";
import { sanitizeToolUseResultPairing } from "./transcript-repair.js";
import { estimateTokens } from "./estimate-tokens.js";
import { formatToolOutputReference } from "./large-files.js";
import { serializeOpenClawSenderMetadata } from "./openclaw-sender-metadata.js";
import { attachTranscriptEntryMeta } from "./transcript.js";
const TOOL_CALL_TYPES = new Set([
    "toolCall",
    "toolUse",
    "tool_use",
    "tool-use",
    "functionCall",
    "function_call",
]);
/** Block types that represent model-internal reasoning and will be stripped
 *  by the provider layer before sending to the API. If an assistant message
 *  contains *only* these block types, it should be treated as empty. */
const THINKING_LIKE_TYPES = new Set(["thinking", "redacted_thinking", "reasoning"]);
/** Returns true when every block in the content array is a thinking/reasoning
 *  block that will be stripped downstream, leaving the message with an empty
 *  content array (which Bedrock and other providers reject). */
function isThinkingOnlyContent(content) {
    if (content.length === 0)
        return false;
    return content.every((block) => !!block &&
        typeof block === "object" &&
        THINKING_LIKE_TYPES.has(block.type));
}
/** Returns true when a content block is a blank or whitespace-only text block. */
function isBlankTextBlock(block) {
    if (!block || typeof block !== "object")
        return false;
    const record = block;
    if (record.type !== "text")
        return false;
    if (typeof record.text !== "string")
        return false;
    return record.text.trim() === "";
}
/** Returns true when every block in the content array is a text block whose
 *  text is empty or whitespace-only. Bedrock rejects messages whose content
 *  is a `[{type:"text", text:""}]` shape with `The text field in the
 *  ContentBlock object at messages.N.content.0 is blank`, so they must be
 *  filtered before the cleaned tail is handed to the provider. */
function isBlankContent(content) {
    if (content.length === 0)
        return false;
    return content.every(isBlankTextBlock);
}
/** Returns true when a message's `content` is an empty/blank shape that the
 *  Bedrock Converse API (and other strict providers) will reject.
 *
 *  Specifically guards against:
 *  - `content === undefined` or `content === null`
 *  - `content === ""` or whitespace-only string
 *  - `content === []` (empty array) for **any** role
 *  - For `assistant`: arrays that are thinking-only or blank-text-only,
 *    since the provider layer strips reasoning blocks and forwards a
 *    `[{type:"text", text:""}]` shape, both of which Bedrock rejects.
 *
 *  Bedrock Converse rejects empty `user` and `toolResult` content arrays
 *  with the literal wording:
 *    `The content field in the Message object at messages.N is empty.
 *     Add a ContentBlock object to the content field and try again.`
 *  This wording is reproducible only when `content === []`; bare strings or
 *  non-empty arrays produce different validation errors. The pre-existing
 *  filter only protected the assistant role, leaving an asymmetric gap when
 *  an empty user/toolResult shape is momentarily produced upstream.
 *
 * @internal Exported for testing only.
 */
export function isEmptyMessageContent(message) {
    if (!message)
        return true;
    const content = message.content;
    if (content === undefined || content === null)
        return true;
    if (Array.isArray(content)) {
        if (content.length === 0)
            return true;
        if (message.role === "assistant") {
            if (isThinkingOnlyContent(content))
                return true;
            if (isBlankContent(content))
                return true;
        }
        return false;
    }
    if (typeof content === "string") {
        return content.trim() === "";
    }
    return false;
}
function freshTailProtectionMessageHashes(messages) {
    const hashes = [];
    for (const message of messages) {
        const messageHashes = new Set();
        messageHashes.add(hashMessages([message]));
        const repairedVariants = sanitizeToolUseResultPairing([message]);
        for (const repaired of repairedVariants) {
            messageHashes.add(hashMessages([repaired]));
        }
        hashes.push(...messageHashes);
    }
    return hashes;
}
const FRESH_TAIL_PROTECTION_MARKER = Symbol("freshTailProtection");
function repairedFreshTailProtectionMessageHashes(entries) {
    const markedMessages = entries.map((entry) => {
        if (entry.segment !== "freshTail") {
            return entry.message;
        }
        return {
            ...entry.message,
            [FRESH_TAIL_PROTECTION_MARKER]: true,
        };
    });
    const repaired = sanitizeToolUseResultPairing(markedMessages);
    return repaired
        .filter((message) => message[FRESH_TAIL_PROTECTION_MARKER])
        .map((message) => hashMessages([message]));
}
// ── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Map a DB message role to an AgentMessage role.
 *
 *   user      -> user
 *   assistant -> assistant
 *   system    -> user       (system prompts presented as user messages)
 *   tool      -> assistant  (tool results are part of assistant turns)
 */
function parseJson(value) {
    if (typeof value !== "string" || !value.trim()) {
        return undefined;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
function getOriginalRole(parts) {
    for (const part of parts) {
        const decoded = parseJson(part.metadata);
        if (!decoded || typeof decoded !== "object") {
            continue;
        }
        const role = decoded.originalRole;
        if (typeof role === "string" && role.length > 0) {
            return role;
        }
    }
    return null;
}
/** Read the assistant model identity persisted by buildMessageParts (if any). */
function pickModelIdentity(parts) {
    for (const part of parts) {
        const decoded = parseJson(part.metadata);
        if (!decoded || typeof decoded !== "object") {
            continue;
        }
        const record = decoded;
        const identity = {};
        if (typeof record.modelProvider === "string" && record.modelProvider.length > 0) {
            identity.provider = record.modelProvider;
        }
        if (typeof record.modelApi === "string" && record.modelApi.length > 0) {
            identity.api = record.modelApi;
        }
        if (typeof record.modelId === "string" && record.modelId.length > 0) {
            identity.model = record.modelId;
        }
        if (typeof record.responseModelId === "string" && record.responseModelId.length > 0) {
            identity.responseModel = record.responseModelId;
        }
        // Mirror the ingest-side gate (extractModelIdentityMetadata): the host's
        // same-model check needs provider+api+model all present. A partial
        // identity must not qualify — it would preserve signatures the host then
        // treats as cross-model (downgrade to text → response-channel
        // contamination). responseModel remains supplemental.
        if (identity.provider !== undefined &&
            identity.api !== undefined &&
            identity.model !== undefined) {
            return identity;
        }
    }
    return undefined;
}
/** True when the part's message-level metadata carries a stored model identity. */
function hasStoredModelIdentity(part) {
    return pickModelIdentity([part]) !== undefined;
}
function getPartMetadata(part) {
    const decoded = parseJson(part.metadata);
    if (!decoded || typeof decoded !== "object") {
        return {};
    }
    const record = decoded;
    return {
        originalRole: typeof record.originalRole === "string" && record.originalRole.length > 0
            ? record.originalRole
            : undefined,
        rawType: typeof record.rawType === "string" && record.rawType.length > 0
            ? record.rawType
            : undefined,
        raw: record.raw,
        topLevelReasoningField: typeof record.topLevelReasoningField === "string" &&
            record.topLevelReasoningField.length > 0
            ? record.topLevelReasoningField
            : undefined,
        topLevelReasoningContent: typeof record.topLevelReasoningContent === "string" &&
            record.topLevelReasoningContent.length > 0
            ? record.topLevelReasoningContent
            : undefined,
        topLevelReasoningOnly: typeof record.topLevelReasoningOnly === "boolean"
            ? record.topLevelReasoningOnly
            : undefined,
    };
}
function parseStoredValue(value) {
    if (typeof value !== "string" || value.length === 0) {
        return undefined;
    }
    const parsed = parseJson(value);
    return parsed !== undefined ? parsed : value;
}
function reasoningBlockFromPart(part, rawType) {
    const type = rawType === "thinking" ? "thinking" : "reasoning";
    if (typeof part.textContent === "string" && part.textContent.length > 0) {
        return type === "thinking"
            ? { type, thinking: part.textContent }
            : { type, text: part.textContent };
    }
    return { type };
}
/**
 * Detect if a raw block is an OpenClaw-normalised OpenAI reasoning item.
 * OpenClaw converts OpenAI `{type:"reasoning", id:"rs_…", encrypted_content:"…"}`
 * into `{type:"thinking", thinking:"", thinkingSignature:"{…}"}`.
 * When we reassemble for the OpenAI provider we need the original back.
 */
function tryRestoreOpenAIReasoning(raw) {
    if (raw.type !== "thinking")
        return null;
    const sig = raw.thinkingSignature;
    if (typeof sig !== "string" || !sig.startsWith("{"))
        return null;
    try {
        const parsed = JSON.parse(sig);
        if (parsed.type === "reasoning" && typeof parsed.id === "string") {
            return parsed;
        }
    }
    catch {
        // not valid JSON — leave as-is
    }
    return null;
}
/** @internal Exported for testing only. */
export function toolCallBlockFromPart(part, rawType) {
    const type = rawType === "function_call" ||
        rawType === "functionCall" ||
        rawType === "tool_use" ||
        rawType === "tool-use" ||
        rawType === "toolUse" ||
        rawType === "toolCall"
        ? rawType
        : "toolCall";
    const input = parseStoredValue(part.toolInput);
    const block = { type };
    if (type === "function_call") {
        if (typeof part.toolCallId === "string" && part.toolCallId.length > 0) {
            block.call_id = part.toolCallId;
        }
        if (typeof part.toolName === "string" && part.toolName.length > 0) {
            block.name = part.toolName;
        }
        if (input !== undefined) {
            block.arguments = input;
        }
        return block;
    }
    // Always set id — downstream providers (e.g. Anthropic) call
    // normalizeToolCallId(block.id) which crashes on undefined.
    block.id =
        typeof part.toolCallId === "string" && part.toolCallId.length > 0
            ? part.toolCallId
            : `toolu_lcm_${part.partId ?? "unknown"}`;
    if (typeof part.toolName === "string" && part.toolName.length > 0) {
        block.name = part.toolName;
    }
    if (input !== undefined) {
        // toolCall and functionCall use "arguments" (consumed by OpenAI/xAI Chat
        // Completions extractToolCalls and Responses API paths in OpenClaw).
        // tool_use and variants use "input" (Anthropic native format).
        if (type === "functionCall" || type === "toolCall") {
            block.arguments = input;
        }
        else {
            block.input = input;
        }
    }
    return block;
}
/** @internal Exported for testing only. */
export function toolResultBlockFromPart(part, rawType, raw) {
    if (raw &&
        typeof raw.text === "string" &&
        raw.output === undefined &&
        raw.content === undefined &&
        (part.toolOutput == null || part.toolOutput === "") &&
        (part.textContent == null || part.textContent === raw.text)) {
        return {
            type: "text",
            text: raw.text,
        };
    }
    const type = rawType === "function_call_output" || rawType === "toolResult" || rawType === "tool_result"
        ? rawType
        : "tool_result";
    const output = parseStoredValue(part.toolOutput);
    const block = { type };
    if (typeof part.toolName === "string" && part.toolName.length > 0) {
        block.name = part.toolName;
    }
    if (output !== undefined) {
        block.output = output;
    }
    else if (typeof part.textContent === "string") {
        block.output = part.textContent;
    }
    else if (raw && raw.output !== undefined) {
        block.output = raw.output;
    }
    else if (raw && raw.content !== undefined) {
        block.content = raw.content;
    }
    else {
        block.output = "";
    }
    if (raw && typeof raw.is_error === "boolean") {
        block.is_error = raw.is_error;
    }
    else if (raw && typeof raw.isError === "boolean") {
        block.isError = raw.isError;
    }
    if (type === "function_call_output") {
        if (typeof part.toolCallId === "string" && part.toolCallId.length > 0) {
            block.call_id = part.toolCallId;
        }
        return block;
    }
    if (typeof part.toolCallId === "string" && part.toolCallId.length > 0) {
        block.tool_use_id = part.toolCallId;
    }
    return block;
}
function toRuntimeRole(dbRole, parts) {
    const originalRole = getOriginalRole(parts);
    if (originalRole === "toolResult") {
        return "toolResult";
    }
    if (originalRole === "assistant") {
        return "assistant";
    }
    if (originalRole === "user") {
        return "user";
    }
    if (originalRole === "system") {
        // Runtime system prompts are managed via setSystemPrompt(), not message history.
        return "user";
    }
    if (dbRole === "tool") {
        return "toolResult";
    }
    if (dbRole === "assistant") {
        return "assistant";
    }
    return "user"; // user | system
}
/**
 * Reconstruct a runtime content block from a stored message part.
 *
 * `messageHasStoredModelIdentity` is the message-level gate for preserving
 * provider-issued thinking signatures (the host's transformMessages then
 * applies its own same-model replay policy). Identity is persisted on
 * ordinal-0 metadata only, so callers that reconstruct a whole message pass
 * the message-level decision in; callers default to the per-part check so a
 * standalone part still behaves correctly.
 *
 * @internal Exported for testing only.
 */
export function blockFromPart(part, messageHasStoredModelIdentity) {
    const hasModelIdentity = messageHasStoredModelIdentity ?? hasStoredModelIdentity(part);
    const metadata = getPartMetadata(part);
    if (metadata.raw && typeof metadata.raw === "object") {
        // If this is an OpenClaw-normalised OpenAI reasoning block, restore the original
        // OpenAI format so the Responses API gets the {type:"reasoning", id:"rs_…"} it expects.
        const restored = tryRestoreOpenAIReasoning(metadata.raw);
        if (restored)
            return restored;
        // Don't return raw for tool call/result blocks — they need to go through
        // toolCallBlockFromPart/toolResultBlockFromPart which properly normalize
        // arguments (stringify if object) and format for the target provider.
        // Returning raw here causes arguments to be passed as a JS object instead
        // of a JSON string, which breaks xAI/OpenAI Chat Completions API (422).
        const rawRecord = metadata.raw;
        const rawType = typeof rawRecord.type === "string" ? rawRecord.type : metadata.rawType;
        if (rawType === "thinking" &&
            typeof rawRecord.thinkingSignature === "string") {
            // "reasoning_content" is OpenClaw's cross-provider sentinel signature
            // (provider-stream stamps it for reasoning_content-native endpoints and
            // the Anthropic client recognizes it), not a provider-issued signature.
            // Preserving it keeps reasoning-native replay working when the assembled
            // message also carries model identity (the host's transformMessages then
            // treats the block as same-model and keeps the sentinel, which the
            // Anthropic client drops from outgoing requests).
            //
            // Legacy rows without stored identity: drop the block entirely. The
            // host's transformMessages would treat it as cross-model (missing
            // identity → downgrade to text), which lands reasoning in the response
            // channel of the chat template — exactly the contamination this patch
            // fixes. Dropping mirrors what the host does to sentinel blocks without
            // identity and avoids polluting the response channel for existing
            // sessions that still have pre-upgrade rows.
            if (rawRecord.thinkingSignature === "reasoning_content") {
                return hasModelIdentity ? rawRecord : null;
            }
            // Provider-issued signatures are kept only when the stored model
            // identity survives to the assembled message (the host's
            // transformMessages then applies its own same-model replay policy).
            // Identity lives on ordinal-0 metadata, so the gate is decided at
            // message level and passed in; per-part check is the single-block
            // fallback. Legacy rows without identity keep the historical strip so
            // foreign signatures cannot leak across a provider switch (#365).
            if (hasModelIdentity) {
                return rawRecord;
            }
            const { thinkingSignature: _thinkingSignature, ...cleaned } = rawRecord;
            return cleaned;
        }
        const isToolBlock = rawType === "toolCall" ||
            rawType === "tool_use" ||
            rawType === "tool-use" ||
            rawType === "toolUse" ||
            rawType === "functionCall" ||
            rawType === "function_call" ||
            rawType === "function_call_output" ||
            rawType === "toolResult" ||
            rawType === "tool_result";
        if (!isToolBlock) {
            return metadata.raw;
        }
        // When tool blocks are routed through toolCallBlockFromPart (below) instead
        // of returning raw directly, the function reads part.toolCallId / part.toolName
        // from the DB columns.  For rows stored as part_type='text' those columns are
        // often NULL — the values only live inside metadata.raw.  Backfill them here
        // so the reconstructed block keeps the original id/name.
        const rawToolCallId = typeof rawRecord.id === "string" && rawRecord.id.length > 0
            ? rawRecord.id
            : typeof rawRecord.call_id === "string" && rawRecord.call_id.length > 0
                ? rawRecord.call_id
                : undefined;
        if (rawToolCallId) {
            if (typeof part.toolCallId !== "string" || part.toolCallId.length === 0) {
                part.toolCallId = rawToolCallId;
            }
        }
        if (typeof rawRecord.name === "string" && rawRecord.name.length > 0) {
            if (typeof part.toolName !== "string" || part.toolName.length === 0) {
                part.toolName = rawRecord.name;
            }
        }
        // Backfill toolInput from raw arguments/input so toolCallBlockFromPart
        // can reconstruct the full block.
        if (part.toolInput == null || part.toolInput === "") {
            const rawArgs = rawRecord.arguments ?? rawRecord.input;
            if (rawArgs !== undefined) {
                part.toolInput = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
            }
        }
    }
    if (part.partType === "reasoning") {
        return reasoningBlockFromPart(part, metadata.rawType);
    }
    if (part.partType === "tool") {
        if (metadata.originalRole === "toolResult" || metadata.rawType === "function_call_output") {
            return toolResultBlockFromPart(part, metadata.rawType, metadata.raw && typeof metadata.raw === "object"
                ? metadata.raw
                : undefined);
        }
        return toolCallBlockFromPart(part, metadata.rawType);
    }
    if (metadata.rawType === "function_call" ||
        metadata.rawType === "functionCall" ||
        metadata.rawType === "tool_use" ||
        metadata.rawType === "tool-use" ||
        metadata.rawType === "toolUse" ||
        metadata.rawType === "toolCall") {
        return toolCallBlockFromPart(part, metadata.rawType);
    }
    if (metadata.rawType === "function_call_output" ||
        metadata.rawType === "tool_result" ||
        metadata.rawType === "toolResult") {
        return toolResultBlockFromPart(part, metadata.rawType, metadata.raw && typeof metadata.raw === "object"
            ? metadata.raw
            : undefined);
    }
    if (part.partType === "text") {
        return { type: "text", text: part.textContent ?? "" };
    }
    if (typeof part.textContent === "string" && part.textContent.length > 0) {
        return { type: "text", text: part.textContent };
    }
    const decodedFallback = parseJson(part.metadata);
    if (decodedFallback && typeof decodedFallback === "object") {
        return {
            type: "text",
            text: JSON.stringify(decodedFallback),
        };
    }
    return { type: "text", text: "" };
}
/** @internal Exported for transcript-maintenance reconstruction. */
export function contentFromParts(parts, role, fallbackContent) {
    const contentParts = parts.filter((part) => !getPartMetadata(part).topLevelReasoningOnly);
    if (contentParts.length === 0) {
        if (role === "assistant") {
            return fallbackContent ? [{ type: "text", text: fallbackContent }] : [];
        }
        if (role === "toolResult") {
            return [{ type: "text", text: fallbackContent }];
        }
        return fallbackContent;
    }
    // Message-level signature-preservation gate: a signature-bearing thinking
    // block may sit at any ordinal, but identity is persisted on ordinal-0
    // metadata, so the decision must see the whole part set.
    const messageHasStoredModelIdentity = role === "assistant" && pickModelIdentity(parts) !== undefined;
    const blocks = contentParts
        .map((part) => blockFromPart(part, messageHasStoredModelIdentity))
        .filter((block) => block != null);
    if (blocks.length === 0) {
        // All content blocks were dropped (e.g. legacy sentinel-only thinking
        // blocks without stored identity). Fall back to stored content like the
        // no-parts branch above.
        if (role === "assistant") {
            return fallbackContent ? [{ type: "text", text: fallbackContent }] : [];
        }
        if (role === "toolResult") {
            return [{ type: "text", text: fallbackContent }];
        }
        return fallbackContent;
    }
    if (role === "user" &&
        blocks.length === 1 &&
        blocks[0] &&
        typeof blocks[0] === "object" &&
        blocks[0].type === "text" &&
        typeof blocks[0].text === "string") {
        return blocks[0].text;
    }
    return blocks;
}
function pickTopLevelAssistantReasoning(parts) {
    for (const part of parts) {
        const metadata = getPartMetadata(part);
        if (metadata.topLevelReasoningField === "reasoning_content" &&
            typeof metadata.topLevelReasoningContent === "string" &&
            metadata.topLevelReasoningContent.length > 0) {
            return { reasoning_content: metadata.topLevelReasoningContent };
        }
    }
    return {};
}
/** @internal Exported for transcript-maintenance reconstruction. */
export function pickToolCallId(parts) {
    for (const part of parts) {
        if (typeof part.toolCallId === "string" && part.toolCallId.length > 0) {
            return part.toolCallId;
        }
        const decoded = parseJson(part.metadata);
        if (!decoded || typeof decoded !== "object") {
            continue;
        }
        const metadataToolCallId = decoded.toolCallId;
        if (typeof metadataToolCallId === "string" && metadataToolCallId.length > 0) {
            return metadataToolCallId;
        }
        const raw = decoded.raw;
        if (!raw || typeof raw !== "object") {
            continue;
        }
        const maybe = raw.toolCallId;
        if (typeof maybe === "string" && maybe.length > 0) {
            return maybe;
        }
        const maybeSnake = raw.tool_call_id;
        if (typeof maybeSnake === "string" && maybeSnake.length > 0) {
            return maybeSnake;
        }
    }
    return undefined;
}
/** @internal Exported for transcript-maintenance reconstruction. */
export function pickToolName(parts) {
    for (const part of parts) {
        if (typeof part.toolName === "string" && part.toolName.length > 0) {
            return part.toolName;
        }
        const decoded = parseJson(part.metadata);
        if (!decoded || typeof decoded !== "object") {
            continue;
        }
        const metadataToolName = decoded.toolName;
        if (typeof metadataToolName === "string" && metadataToolName.length > 0) {
            return metadataToolName;
        }
        const raw = decoded.raw;
        if (!raw || typeof raw !== "object") {
            continue;
        }
        const maybe = raw.name;
        if (typeof maybe === "string" && maybe.length > 0) {
            return maybe;
        }
        const maybeCamel = raw.toolName;
        if (typeof maybeCamel === "string" && maybeCamel.length > 0) {
            return maybeCamel;
        }
    }
    return undefined;
}
/** @internal Exported for transcript-maintenance reconstruction. */
export function pickToolIsError(parts) {
    for (const part of parts) {
        const decoded = parseJson(part.metadata);
        if (!decoded || typeof decoded !== "object") {
            continue;
        }
        const metadataIsError = decoded.isError;
        if (typeof metadataIsError === "boolean") {
            return metadataIsError;
        }
    }
    return undefined;
}
function extractToolCallId(block) {
    if (typeof block.id === "string" && block.id.length > 0) {
        return block.id;
    }
    if (typeof block.call_id === "string" && block.call_id.length > 0) {
        return block.call_id;
    }
    return null;
}
function extractToolCallIdsFromAssistant(message) {
    if (message?.role !== "assistant" || !Array.isArray(message.content)) {
        return [];
    }
    const ids = [];
    for (const block of message.content) {
        if (!block || typeof block !== "object") {
            continue;
        }
        const record = block;
        if (typeof record.type !== "string" || !TOOL_CALL_TYPES.has(record.type)) {
            continue;
        }
        const id = extractToolCallId(record);
        if (id) {
            ids.push(id);
        }
    }
    return ids;
}
function extractToolResultIdFromMessage(message) {
    if (!message || typeof message !== "object") {
        return null;
    }
    if (typeof message.toolCallId === "string" && message.toolCallId.length > 0) {
        return message.toolCallId;
    }
    if (typeof message.toolUseId === "string" && message.toolUseId.length > 0) {
        return message.toolUseId;
    }
    return null;
}
function filterNonFreshAssistantToolCalls(items, freshTailOrdinals, orphanStrippingOrdinal, allToolResultOrdinalsById) {
    const selectedToolResultOrdinalsById = new Map();
    for (const item of items) {
        const toolResultId = extractToolResultIdFromMessage(item.message);
        if (toolResultId) {
            const ordinals = selectedToolResultOrdinalsById.get(toolResultId);
            if (ordinals) {
                ordinals.push(item.ordinal);
            }
            else {
                selectedToolResultOrdinalsById.set(toolResultId, [item.ordinal]);
            }
        }
    }
    const filteredEntries = [];
    let removedToolUseBlockCount = 0;
    let touchedAssistantMessageCount = 0;
    for (const item of items) {
        const segment = freshTailOrdinals.has(item.ordinal) ? "freshTail" : "evictable";
        if (item.message?.role !== "assistant") {
            filteredEntries.push({ message: item.message, segment });
            continue;
        }
        if (!Array.isArray(item.message.content)) {
            filteredEntries.push({ message: item.message, segment });
            continue;
        }
        let removedAny = false;
        const content = item.message.content.filter((block) => {
            if (!block || typeof block !== "object") {
                return true;
            }
            const record = block;
            if (typeof record.type !== "string" || !TOOL_CALL_TYPES.has(record.type)) {
                return true;
            }
            const toolCallId = extractToolCallId(record);
            if (!toolCallId) {
                return true;
            }
            const selectedOrdinals = selectedToolResultOrdinalsById.get(toolCallId) ?? [];
            const hasUsableSelectedResult = selectedOrdinals.some((ordinal) => ordinal > item.ordinal);
            if (hasUsableSelectedResult) {
                return true;
            }
            if (item.ordinal < orphanStrippingOrdinal) {
                removedAny = true;
                return false;
            }
            if (!(allToolResultOrdinalsById.get(toolCallId)?.length)) {
                return true;
            }
            removedAny = true;
            return false;
        });
        if (content.length === 0) {
            removedToolUseBlockCount++;
            touchedAssistantMessageCount++;
            continue;
        }
        if (!removedAny) {
            filteredEntries.push({ message: item.message, segment });
            continue;
        }
        removedToolUseBlockCount++;
        touchedAssistantMessageCount++;
        filteredEntries.push({
            message: {
                ...item.message,
                content: content,
            },
            segment,
        });
    }
    return {
        entries: filteredEntries,
        removedToolUseBlockCount,
        touchedAssistantMessageCount,
    };
}
function hashMessages(messages) {
    return createHash("sha256").update(JSON.stringify(messages)).digest("hex").slice(0, 16);
}
/**
 * v4.2 §B (Option C) — render the stub for an evictable tool-result whose
 * row was externalized to `large_files` (its `messages.large_content`
 * stores the file_xxx id). Reuses the v4.1 `formatToolOutputReference`
 * format so the agent sees the same `[LCM Tool Output: …]` shape it has
 * encountered in production for months — known drilldown path,
 * `lcm_describe(id="file_xxx")`, with conversation scoping and
 * suppression filtering already wired up.
 */
function buildToolPayloadStub(fileId, toolName, byteSize, summary) {
    const content = formatToolOutputReference({
        fileId,
        toolName,
        byteSize,
        summary: summary ?? "",
    });
    const tokens = estimateTokens(content);
    return { content, tokens };
}
/**
 * v4.2 §B (Option C) — walk an evictable item list and replace payload-tier
 * tool-result messages with the v4.1 `[LCM Tool Output: file_xxx …]` reference.
 *
 * Skip rules (post-adversarial-review):
 *  - Item must have a `fileId` (i.e. `messages.large_content` set + lookup hit).
 *  - Item's `messageId` must be present (defense-in-depth).
 *  - Item's `message.role` must be `"toolResult"`. Legacy rows that
 *    `resolveMessageItem` downgrades to `"assistant"` (DB role 'tool' but no
 *    toolCallId) are NOT stubbed: there's no upstream `tool_use` to pair with,
 *    so emitting a tool-output reference would create a phantom drilldown.
 *  - Multi-block tool_result content (`Array<{type, ...}>`) is replaced as a
 *    1-element text-block array so we preserve the array shape Anthropic
 *    expects, instead of collapsing to a string. (P1 fix.)
 */
function applyStubSubstitution(evictable) {
    let stubbedCount = 0;
    let tokensSaved = 0;
    for (const item of evictable) {
        if (!item.fileId)
            continue;
        if (item.messageId == null)
            continue;
        if (item.message.role !== "toolResult")
            continue;
        const stub = buildToolPayloadStub(item.fileId, item.stubToolName, item.fileByteSize ?? 0, item.fileSummary);
        const oldTokens = item.tokens;
        const wasArray = Array.isArray(item.message.content);
        const newContent = wasArray
            ? [{ type: "text", text: stub.content }]
            : stub.content;
        item.message = {
            ...item.message,
            content: newContent,
        };
        item.tokens = stub.tokens;
        item.text = stub.content;
        stubbedCount += 1;
        tokensSaved += Math.max(0, oldTokens - stub.tokens);
    }
    return { stubbedCount, tokensSaved };
}
function hashText(text) {
    return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
function escapeXmlAttribute(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
function escapeXmlText(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
/** Format a Date for XML attributes in the agent's timezone. */
function formatDateForAttribute(date, timezone) {
    const tz = timezone ?? "UTC";
    try {
        const fmt = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        });
        const p = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
        return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
    }
    catch {
        return date.toISOString();
    }
}
/**
 * Format a summary record into the XML payload string the model sees.
 */
async function formatSummaryContent(summary, summaryStore, timezone) {
    const attributes = [
        `id="${escapeXmlAttribute(summary.summaryId)}"`,
        `kind="${escapeXmlAttribute(summary.kind)}"`,
        `depth="${summary.depth}"`,
        `descendant_count="${summary.descendantCount}"`,
        // Taint label (issue #71): marks summary content as untrusted historical
        // context so downstream models don't treat injected directives within it as
        // current instructions.
        `trust="untrusted"`,
    ];
    if (summary.earliestAt) {
        attributes.push(`earliest_at="${formatDateForAttribute(summary.earliestAt, timezone)}"`);
    }
    if (summary.latestAt) {
        attributes.push(`latest_at="${formatDateForAttribute(summary.latestAt, timezone)}"`);
    }
    const lines = [];
    lines.push(`<summary ${attributes.join(" ")}>`);
    // For condensed summaries, include parent references.
    if (summary.kind === "condensed") {
        const parents = await summaryStore.getSummaryParents(summary.summaryId);
        if (parents.length > 0) {
            lines.push("  <parents>");
            for (const parent of parents) {
                lines.push(`    <summary_ref id="${escapeXmlAttribute(parent.summaryId)}" />`);
            }
            lines.push("  </parents>");
        }
    }
    lines.push("  <content>");
    lines.push(escapeXmlText(summary.content));
    lines.push("  </content>");
    lines.push("</summary>");
    return lines.join("\n");
}
function formatFocusBriefContent(brief, timezone) {
    const attributes = [
        `id="${escapeXmlAttribute(brief.briefId)}"`,
        `prompt="${escapeXmlAttribute(brief.prompt)}"`,
        `token_count="${brief.tokenCount}"`,
        `target_tokens="${brief.targetTokens}"`,
        `created_at="${formatDateForAttribute(brief.createdAt, timezone)}"`,
    ];
    if (brief.coveredLatestAt) {
        attributes.push(`covered_latest_at="${formatDateForAttribute(brief.coveredLatestAt, timezone)}"`);
    }
    if (brief.coveredMessageSeq != null) {
        attributes.push(`covered_message_seq="${brief.coveredMessageSeq}"`);
    }
    return [
        `<focus_brief ${attributes.join(" ")}>`,
        "  <content>",
        brief.content,
        "  </content>",
        "</focus_brief>",
    ].join("\n");
}
function topContributors(items, selectedOrdinals, isMessage) {
    return items
        .filter((item) => item.isMessage === isMessage)
        .slice()
        .sort((a, b) => b.tokens - a.tokens || a.ordinal - b.ordinal)
        .slice(0, 5)
        .map((item) => ({
        ordinal: item.ordinal,
        tokens: item.tokens,
        selected: selectedOrdinals.has(item.ordinal),
        ...(item.messageId != null ? { messageId: item.messageId } : {}),
        ...(item.seq != null ? { seq: item.seq } : {}),
        ...(item.sourceRole ? { role: item.sourceRole } : {}),
        ...(item.summary
            ? {
                summaryId: item.summary.summaryId,
                summaryKind: item.summary.kind,
                summaryDepth: item.summary.depth,
            }
            : {}),
    }));
}
function buildRefDuplicateClusters(items) {
    const clusters = new Map();
    for (const item of items) {
        const key = item.isMessage
            ? item.messageId == null ? null : `message:${item.messageId}`
            : item.summary == null ? null : `summary:${item.summary.summaryId}`;
        if (!key) {
            continue;
        }
        const existing = clusters.get(key) ?? [];
        existing.push(item);
        clusters.set(key, existing);
    }
    return formatDuplicateClusters(clusters, (key) => key.startsWith("message:") ? "message-ref" : "summary-ref");
}
function buildMessageContentDuplicateClusters(items) {
    const clusters = new Map();
    for (const item of items) {
        if (!item.isMessage || item.text.length === 0) {
            continue;
        }
        const hash = hashText(item.text);
        const existing = clusters.get(hash) ?? [];
        existing.push(item);
        clusters.set(hash, existing);
    }
    return formatDuplicateClusters(clusters, () => "message-content");
}
function formatDuplicateClusters(clusters, kindForKey) {
    return [...clusters.entries()]
        .filter(([, items]) => items.length > 1)
        .map(([key, items]) => ({
        key,
        kind: kindForKey(key),
        count: items.length,
        tokens: items.reduce((sum, item) => sum + item.tokens, 0),
        ordinals: items.map((item) => item.ordinal).slice(0, 8),
        ...(items.some((item) => item.seq != null)
            ? { seqs: items.flatMap((item) => item.seq == null ? [] : [item.seq]).slice(0, 8) }
            : {}),
    }))
        .sort((a, b) => b.tokens - a.tokens || b.count - a.count || a.key.localeCompare(b.key))
        .slice(0, 5);
}
function buildOverflowDiagnostics(params) {
    const selectedOrdinals = new Set(params.selected.map((item) => item.ordinal));
    const rawMessageItems = params.resolved.filter((item) => item.isMessage);
    const summaryItems = params.resolved.filter((item) => !item.isMessage);
    return {
        tokenBudget: params.tokenBudget,
        totalContextTokens: params.resolved.reduce((sum, item) => sum + item.tokens, 0),
        rawMessageTokens: rawMessageItems.reduce((sum, item) => sum + item.tokens, 0),
        summaryTokens: summaryItems.reduce((sum, item) => sum + item.tokens, 0),
        rawMessageCount: rawMessageItems.length,
        summaryCount: summaryItems.length,
        totalContextItems: params.resolved.length,
        selectedRawMessageCount: params.selected.filter((item) => item.isMessage).length,
        selectedSummaryCount: params.selected.filter((item) => !item.isMessage).length,
        duplicateRefClusters: buildRefDuplicateClusters(params.resolved),
        duplicateMessageClusters: buildMessageContentDuplicateClusters(params.resolved),
        topMessageContributors: topContributors(params.resolved, selectedOrdinals, true),
        topSummaryContributors: topContributors(params.resolved, selectedOrdinals, false),
    };
}
function resolveFreshTailOrdinal(resolved, freshTailCount, freshTailMaxTokens) {
    if (!Number.isFinite(freshTailCount) || freshTailCount <= 0) {
        return Infinity;
    }
    const rawMessages = resolved.filter((item) => item.isMessage);
    if (rawMessages.length === 0) {
        return Infinity;
    }
    const tokenCap = typeof freshTailMaxTokens === "number" &&
        Number.isFinite(freshTailMaxTokens) &&
        freshTailMaxTokens >= 0
        ? Math.floor(freshTailMaxTokens)
        : undefined;
    let protectedCount = 0;
    let protectedTokens = 0;
    let tailStartOrdinal = Infinity;
    const latestUserOrdinal = rawMessages.findLast((item) => item.sourceRole === "user")?.ordinal;
    for (let idx = rawMessages.length - 1; idx >= 0; idx--) {
        const latestUserProtected = latestUserOrdinal === undefined || tailStartOrdinal <= latestUserOrdinal;
        if (latestUserProtected && protectedCount >= freshTailCount) {
            break;
        }
        const item = rawMessages[idx];
        if (!item) {
            continue;
        }
        const wouldExceedBudget = latestUserProtected &&
            protectedCount > 0 &&
            typeof tokenCap === "number" &&
            protectedTokens + item.tokens > tokenCap;
        if (wouldExceedBudget) {
            break;
        }
        tailStartOrdinal = item.ordinal;
        protectedCount++;
        protectedTokens += item.tokens;
    }
    return tailStartOrdinal;
}
// ── BM25-lite relevance scorer ────────────────────────────────────────────────
/** @internal Exported for testing only. Tokenize text into lowercase alphanumeric terms. */
export function tokenizeText(text) {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1);
}
/**
 * @internal Exported for testing only.
 * Score an item's text against a prompt using BM25-lite (term-frequency overlap).
 * Higher scores indicate stronger keyword overlap. Returns 0 when either input is empty.
 */
export function scoreRelevance(itemText, prompt) {
    const promptTerms = tokenizeText(prompt);
    if (promptTerms.length === 0)
        return 0;
    const itemTerms = tokenizeText(itemText);
    if (itemTerms.length === 0)
        return 0;
    // Build term-frequency map for the item
    const freq = new Map();
    for (const term of itemTerms) {
        freq.set(term, (freq.get(term) ?? 0) + 1);
    }
    // Sum TF contribution for each unique prompt term
    const seen = new Set();
    let score = 0;
    for (const term of promptTerms) {
        if (seen.has(term))
            continue;
        seen.add(term);
        const tf = freq.get(term) ?? 0;
        if (tf > 0) {
            // Normalised TF: tf / itemLength (BM25-lite saturation skipped for simplicity)
            score += tf / itemTerms.length;
        }
    }
    return score;
}
/** Return true when a prompt contains at least one searchable term. */
function hasSearchablePrompt(prompt) {
    return typeof prompt === "string" && tokenizeText(prompt).length > 0;
}
// ── ContextAssembler ─────────────────────────────────────────────────────────
export class ContextAssembler {
    conversationStore;
    summaryStore;
    timezone;
    focusBriefStore;
    log;
    constructor(conversationStore, summaryStore, timezone, focusBriefStore, log) {
        this.conversationStore = conversationStore;
        this.summaryStore = summaryStore;
        this.timezone = timezone;
        this.focusBriefStore = focusBriefStore;
        this.log = log;
    }
    /**
     * Build model context under a token budget.
     *
     * 1. Fetch all context items for the conversation (ordered by ordinal).
     * 2. Resolve each item into an AgentMessage (fetching the underlying
     *    message or summary record).
     * 3. Protect the "fresh tail" (last N raw messages, optionally token-capped)
     *    from truncation.
     * 4. If over budget, drop oldest non-fresh items until we fit.
     * 5. Return the final ordered messages in chronological order.
     */
    async assemble(input) {
        const { conversationId, tokenBudget } = input;
        const freshTailCount = input.freshTailCount ?? 8;
        // Step 1: Get all context items ordered by ordinal
        const contextItems = await this.summaryStore.getContextItems(conversationId);
        if (contextItems.length === 0) {
            return {
                messages: [],
                estimatedTokens: 0,
                stats: { rawMessageCount: 0, summaryCount: 0, totalContextItems: 0 },
            };
        }
        // Step 2: Resolve each context item into a ResolvedItem, then apply any
        // active focus overlay without mutating canonical context_items rows.
        const canonicalResolved = await this.resolveItems(contextItems);
        const resolved = await this.applyFocusOverlay(conversationId, canonicalResolved);
        // Count stats from the full (pre-truncation) set
        let rawMessageCount = 0;
        let summaryCount = 0;
        for (const item of resolved) {
            if (item.isMessage) {
                rawMessageCount++;
            }
            else if (!item.isFocusBrief) {
                summaryCount++;
            }
        }
        // Step 3: Split into evictable prefix and protected fresh tail
        const freshTailOrdinal = resolveFreshTailOrdinal(resolved, freshTailCount, input.freshTailMaxTokens);
        const orphanStrippingOrdinal = freshTailOrdinal;
        const allToolResultOrdinalsById = new Map();
        for (const item of resolved) {
            const toolResultId = extractToolResultIdFromMessage(item.message);
            if (!toolResultId) {
                continue;
            }
            const ordinals = allToolResultOrdinalsById.get(toolResultId);
            if (ordinals) {
                ordinals.push(item.ordinal);
            }
            else {
                allToolResultOrdinalsById.set(toolResultId, [item.ordinal]);
            }
        }
        const focusBriefItems = resolved.filter((item) => item.isFocusBrief);
        const baseFreshTail = resolved.filter((item) => !item.isFocusBrief && item.ordinal >= freshTailOrdinal);
        const evictable = resolved.filter((item) => !item.isFocusBrief && item.ordinal < freshTailOrdinal);
        const freshTail = baseFreshTail;
        // v4.2 §B — stub-tier substitution. Replace evictable tool-result
        // payloads (rows with `large_content` populated) with compact stubs
        // BEFORE the budget pass so the budget sees the smaller token
        // footprint. Fresh-tail items are protected and never substituted.
        let stubStats = { stubbedCount: 0, tokensSaved: 0 };
        if (input.stubLargeToolPayloads === true) {
            stubStats = applyStubSubstitution(evictable);
        }
        // Step 4: Budget-aware selection
        // First, compute the token cost of protected focus overlays and fresh tail.
        let focusBriefTokens = 0;
        for (const item of focusBriefItems) {
            focusBriefTokens += item.tokens;
        }
        let tailTokens = 0;
        for (const item of freshTail) {
            tailTokens += item.tokens;
        }
        // Fill remaining budget from evictable items, oldest first.
        // If the fresh tail alone exceeds the budget we still include it
        // (we never drop fresh items), but we skip all evictable items.
        const remainingBudget = Math.max(0, tokenBudget - tailTokens - focusBriefTokens);
        const selected = [];
        let evictableTokens = 0;
        // Walk evictable items from oldest to newest. We want to keep as many
        // older items as the budget allows; once we exceed the budget we start
        // dropping the *oldest* items. To achieve this we first compute the
        // total, then trim from the front.
        const evictableTotalTokens = evictable.reduce((sum, it) => sum + it.tokens, 0);
        let selectionMode = "full-fit";
        if (evictableTotalTokens <= remainingBudget) {
            // Everything fits
            selected.push(...evictable);
            evictableTokens = evictableTotalTokens;
        }
        else if (input.promptAwareEviction !== false && hasSearchablePrompt(input.prompt)) {
            const searchablePrompt = input.prompt;
            selectionMode = "prompt-aware";
            // Prompt-aware eviction: score each evictable item by relevance to the
            // prompt, then greedily fill budget from highest-scoring items down.
            // Re-sort selected items by ordinal to restore chronological order.
            const scored = evictable.map((item, idx) => ({
                item,
                score: scoreRelevance(item.text, searchablePrompt),
                idx, // original index — higher = more recent, used as tiebreaker
            }));
            // Sort: highest relevance first; most recent (higher idx) breaks ties
            scored.sort((a, b) => b.score - a.score || b.idx - a.idx);
            const kept = [];
            let accum = 0;
            for (const { item } of scored) {
                if (accum + item.tokens <= remainingBudget) {
                    kept.push(item);
                    accum += item.tokens;
                }
            }
            // Restore chronological order by ordinal before appending freshTail
            kept.sort((a, b) => a.ordinal - b.ordinal);
            selected.push(...kept);
            evictableTokens = accum;
        }
        else {
            selectionMode = "chronological";
            // Chronological eviction (default): drop oldest items until we fit.
            // Walk from the END of evictable (newest first) accumulating tokens,
            // then reverse to restore chronological order.
            const kept = [];
            let accum = 0;
            for (let i = evictable.length - 1; i >= 0; i--) {
                const item = evictable[i];
                if (accum + item.tokens <= remainingBudget) {
                    kept.push(item);
                    accum += item.tokens;
                }
                else {
                    // Once an item doesn't fit we stop — all older items are also dropped
                    break;
                }
            }
            kept.reverse();
            selected.push(...kept);
            evictableTokens = accum;
        }
        // Append protected focus overlays and fresh tail, then restore context
        // order. Focus overlays are always included while active.
        selected.push(...focusBriefItems);
        selected.push(...freshTail);
        selected.sort((a, b) => a.ordinal - b.ordinal || (a.isFocusBrief ? -1 : b.isFocusBrief ? 1 : 0));
        const estimatedTokens = evictableTokens + tailTokens + focusBriefTokens;
        const overflowDiagnostics = buildOverflowDiagnostics({
            resolved,
            selected,
            tokenBudget,
        });
        // Normalize assistant string content to array blocks (some providers return
        // content as a plain string; Anthropic expects content block arrays).
        const filteredToolCalls = filterNonFreshAssistantToolCalls(selected, new Set(freshTail.map((item) => item.ordinal)), orphanStrippingOrdinal, allToolResultOrdinalsById);
        const normalizedEntries = filteredToolCalls.entries.map((entry) => {
            const msg = entry.message;
            if (msg?.role === "assistant" && typeof msg.content === "string") {
                return {
                    ...entry,
                    message: {
                        ...msg,
                        content: [{ type: "text", text: msg.content }],
                    },
                };
            }
            if (msg?.role === "assistant" && Array.isArray(msg.content)) {
                const content = msg.content.filter((block) => !isBlankTextBlock(block));
                if (content.length !== msg.content.length) {
                    return {
                        ...entry,
                        message: {
                            ...msg,
                            content: content,
                        },
                    };
                }
            }
            return entry;
        });
        // Filter messages whose content normalises to no content — these can occur
        // when tool-use-only turns are stored with content="" and zero
        // message_parts, when filterNonFreshAssistantToolCalls strips all tool_use
        // blocks, when an assistant turn contains only thinking/reasoning blocks
        // that will be stripped by the provider layer, when the stored content is
        // a `[{type:"text", text:""}]` blank-text shape, or when an upstream layer
        // momentarily produces an empty `user` or `toolResult` content array.
        // Anthropic and Bedrock reject any of these
        // as empty; Bedrock's specific wording for `content === []` is
        // `The content field in the Message object at messages.N is empty.
        //  Add a ContentBlock object to the content field and try again.`
        // Dropping a `toolResult` here is safe — sanitizeToolUseResultPairing runs
        // immediately below and re-pairs missing results with a synthetic
        // `[lossless-claw] missing tool result …` placeholder.
        const cleanedEntries = normalizedEntries.filter((entry) => !isEmptyMessageContent(entry.message));
        const cleaned = cleanedEntries.map((entry) => entry.message);
        const preSanitizeEvictableMessages = cleanedEntries
            .filter((entry) => entry.segment === "evictable")
            .map((entry) => entry.message);
        const preSanitizeFreshTailMessages = cleanedEntries
            .filter((entry) => entry.segment === "freshTail")
            .map((entry) => entry.message);
        const repaired = sanitizeToolUseResultPairing(cleaned, this.log);
        const protectionHashes = new Set([
            ...freshTailProtectionMessageHashes(preSanitizeFreshTailMessages),
            ...repairedFreshTailProtectionMessageHashes(cleanedEntries),
        ]);
        return {
            messages: repaired,
            estimatedTokens,
            stats: {
                rawMessageCount,
                summaryCount,
                totalContextItems: resolved.length,
            },
            debug: {
                freshTailOrdinal,
                orphanStrippingOrdinal,
                baseFreshTailCount: baseFreshTail.length,
                freshTailCount: freshTail.length,
                tailTokens,
                remainingBudget,
                evictableTotalTokens,
                selectionMode,
                promotedToolResultCount: 0,
                promotedOrdinals: [],
                removedToolUseBlockCount: filteredToolCalls.removedToolUseBlockCount,
                touchedAssistantMessageCount: filteredToolCalls.touchedAssistantMessageCount,
                preSanitizeEvictableCount: preSanitizeEvictableMessages.length,
                preSanitizeFreshTailCount: preSanitizeFreshTailMessages.length,
                preSanitizeEvictableHash: hashMessages(preSanitizeEvictableMessages),
                preSanitizeFreshTailHash: hashMessages(preSanitizeFreshTailMessages),
                preSanitizeFreshTailMessageHashes: preSanitizeFreshTailMessages.map((message) => hashMessages([message])),
                freshTailProtectionMessageHashes: [...protectionHashes],
                preSanitizeMessagesHash: hashMessages(cleaned),
                finalMessagesHash: hashMessages(repaired),
                overflowDiagnostics,
                stubStats,
            },
        };
    }
    // ── Private helpers ──────────────────────────────────────────────────────
    isSummaryCoveredByFocus(item, brief) {
        if (!item.summary) {
            return false;
        }
        if (brief.coveredMessageSeq != null && item.summaryMaxSourceSeq != null) {
            return item.summaryMaxSourceSeq <= brief.coveredMessageSeq;
        }
        if (brief.coveredLatestAt && item.summary.latestAt) {
            return item.summary.latestAt.getTime() <= brief.coveredLatestAt.getTime();
        }
        return false;
    }
    async applyFocusOverlay(conversationId, resolved) {
        const brief = await this.focusBriefStore?.getActiveFocusBrief(conversationId);
        if (!brief?.content.trim()) {
            return resolved;
        }
        const covered = new Set();
        let firstCoveredOrdinal = Infinity;
        for (const item of resolved) {
            if (!this.isSummaryCoveredByFocus(item, brief)) {
                continue;
            }
            covered.add(item);
            firstCoveredOrdinal = Math.min(firstCoveredOrdinal, item.ordinal);
        }
        if (covered.size === 0 || firstCoveredOrdinal === Infinity) {
            return resolved;
        }
        const content = formatFocusBriefContent(brief, this.timezone);
        const focusItem = {
            ordinal: firstCoveredOrdinal,
            message: { role: "user", content },
            tokens: estimateTokens(content),
            isMessage: false,
            isFocusBrief: true,
            text: brief.content,
        };
        const output = [];
        let inserted = false;
        for (const item of resolved) {
            if (covered.has(item)) {
                continue;
            }
            if (!inserted && item.ordinal > firstCoveredOrdinal) {
                output.push(focusItem);
                inserted = true;
            }
            output.push(item);
        }
        if (!inserted) {
            output.push(focusItem);
        }
        return output;
    }
    /**
     * Resolve a list of context items into ResolvedItems by fetching the
     * underlying message or summary record for each.
     *
     * Items that cannot be resolved (e.g. deleted message) are silently skipped.
     */
    async resolveItems(contextItems) {
        const resolved = [];
        for (const item of contextItems) {
            const result = await this.resolveItem(item);
            if (result) {
                resolved.push(result);
            }
        }
        return resolved;
    }
    /**
     * Resolve a single context item.
     */
    async resolveItem(item) {
        if (item.itemType === "message" && item.messageId != null) {
            return this.resolveMessageItem(item);
        }
        if (item.itemType === "summary" && item.summaryId != null) {
            return this.resolveSummaryItem(item);
        }
        // Malformed item — skip
        return null;
    }
    /**
     * Resolve a context item that references a raw message.
     */
    async resolveMessageItem(item) {
        const msg = await this.conversationStore.getMessageById(item.messageId);
        if (!msg) {
            return null;
        }
        const parts = await this.conversationStore.getMessageParts(msg.messageId);
        // Skip empty assistant messages left by error/aborted responses.
        // These waste context tokens and can confuse models that reject
        // consecutive empty assistant turns.  Only skip when both the stored
        // content text AND the message_parts table are empty — assistant
        // messages that contain tool calls have empty text content but
        // non-empty parts and must be preserved.
        if (msg.role === "assistant" && !(typeof msg.content === "string" ? msg.content.trim() : "") && parts.length === 0) {
            return null;
        }
        const roleFromStore = toRuntimeRole(msg.role, parts);
        const isToolResult = roleFromStore === "toolResult";
        const toolCallId = isToolResult ? pickToolCallId(parts) : undefined;
        const toolName = isToolResult ? (pickToolName(parts) ?? "unknown") : undefined;
        const toolIsError = isToolResult ? pickToolIsError(parts) : undefined;
        // Tool results without a call id cannot be serialized for Anthropic-compatible APIs.
        // This happens for legacy/bootstrap rows that have role=tool but no message_parts.
        // Preserve the text by degrading to assistant content instead of emitting invalid toolResult.
        const role = isToolResult && !toolCallId ? "assistant" : roleFromStore;
        const content = contentFromParts(parts, role, msg.content);
        const topLevelAssistantReasoning = role === "assistant" ? pickTopLevelAssistantReasoning(parts) : {};
        const modelIdentity = role === "assistant" ? pickModelIdentity(parts) : undefined;
        const contentText = typeof content === "string" ? content : (JSON.stringify(content) ?? msg.content);
        const topLevelReasoningText = Object.values(topLevelAssistantReasoning).join("\n");
        const senderMetadataText = role === "user"
            ? (serializeOpenClawSenderMetadata(msg.openClawSenderMetadata) ?? "")
            : "";
        const tokenCount = estimateTokens([contentText, topLevelReasoningText, senderMetadataText].filter(Boolean).join("\n"));
        // v4.2 §B (Option C) — `messages.large_content` now stores the
        // externalized `file_xxx` id, not a content copy. When present, look
        // up `large_files` for byteSize / summary so applyStubSubstitution
        // can build the v4.1 [LCM Tool Output: …] reference.
        const fileIdFromSidecar = typeof msg.largeContent === "string" && msg.largeContent.startsWith("file_")
            ? msg.largeContent
            : null;
        let fileMeta = null;
        if (fileIdFromSidecar) {
            const fileRow = await this.summaryStore.getLargeFile(fileIdFromSidecar);
            if (fileRow) {
                fileMeta = {
                    byteSize: fileRow.byteSize ?? 0,
                    summary: fileRow.explorationSummary ?? undefined,
                };
            }
        }
        const stubEligible = fileIdFromSidecar != null && fileMeta != null && role === "toolResult";
        // Cast: these are reconstructed from DB storage, not live agent messages,
        // so they won't carry the full AgentMessage metadata (timestamp, usage, etc.)
        return {
            ordinal: item.ordinal,
            message: role === "assistant"
                ? {
                    role,
                    content,
                    ...(modelIdentity ?? {}),
                    ...topLevelAssistantReasoning,
                    usage: {
                        input: 0,
                        output: tokenCount,
                        cacheRead: 0,
                        cacheWrite: 0,
                        totalTokens: tokenCount,
                        cost: {
                            input: 0,
                            output: 0,
                            cacheRead: 0,
                            cacheWrite: 0,
                            total: 0,
                        },
                    },
                }
                : attachTranscriptEntryMeta({
                    role,
                    content,
                    ...(role === "user" && msg.openClawSenderMetadata
                        ? { __openclaw: msg.openClawSenderMetadata }
                        : {}),
                    ...(toolCallId ? { toolCallId } : {}),
                    ...(toolName ? { toolName } : {}),
                    ...(role === "toolResult" && toolIsError !== undefined ? { isError: toolIsError } : {}),
                }, {
                    entryId: role === "user" && msg.transcriptEntryId &&
                        await this.conversationStore.isTrustedTranscriptAnchor(msg.conversationId, msg.transcriptEntryId)
                        ? msg.transcriptEntryId : null,
                    parentId: null,
                    timestamp: null,
                }),
            tokens: tokenCount,
            isMessage: true,
            text: contentText,
            messageId: msg.messageId,
            seq: msg.seq,
            sourceRole: msg.role,
            ...(stubEligible && fileIdFromSidecar ? { fileId: fileIdFromSidecar } : {}),
            ...(stubEligible && fileMeta ? { fileByteSize: fileMeta.byteSize } : {}),
            ...(stubEligible && fileMeta?.summary ? { fileSummary: fileMeta.summary } : {}),
            ...(stubEligible && toolName ? { stubToolName: toolName } : {}),
            ...(stubEligible && toolCallId ? { stubToolCallId: toolCallId } : {}),
        };
    }
    /**
     * Resolve a context item that references a summary.
     *
     * Summaries are presented as user messages with a structured XML wrapper
     * and explicit taint metadata marking them as historical context rather
     * than current instructions.  This mitigates prompt-injection persistence
     * across compaction boundaries.
     */
    async resolveSummaryItem(item) {
        const summary = await this.summaryStore.getSummary(item.summaryId);
        if (!summary) {
            return null;
        }
        const content = await formatSummaryContent(summary, this.summaryStore, this.timezone);
        const tokens = estimateTokens(content);
        const seqRange = typeof this.summaryStore.getSummaryMessageSeqRange === "function"
            ? await this.summaryStore.getSummaryMessageSeqRange(summary.summaryId)
            : { maxSeq: null };
        // Summaries are synthetic user messages — content carries a
        // trust="untrusted" taint label on the <summary> tag to mitigate
        // injection persistence (semantics defined in the recall system prompt).
        //
        // NOTE: the role stays "user" deliberately. A non-user role would be
        // stronger (issue #71 rec. 1), but neither available runtime role is safe
        // here: "toolResult" has no paired tool call and is dropped by
        // sanitizeToolUseResultPairing, and "assistant" risks provider
        // first-message/alternation constraints handled only by OpenClaw upstream.
        // Downgrading the role requires upstream support; tracked in issue #71.
        return {
            ordinal: item.ordinal,
            message: { role: "user", content },
            tokens,
            isMessage: false,
            text: summary.content,
            summary,
            summaryMaxSourceSeq: seqRange.maxSeq,
        };
    }
}
