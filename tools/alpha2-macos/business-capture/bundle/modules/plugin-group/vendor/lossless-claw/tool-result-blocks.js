/** Build the compact replacement block for an externalized tool result. */
export function buildExternalizedToolResultBlock(params) {
    const block = params.isPlainTextToolResult
        ? {
            type: "text",
            text: params.reference,
            rawType: params.normalizedRawType,
            externalizedFileId: params.fileId,
            originalByteSize: params.byteSize,
            toolOutputExternalized: true,
            externalizationReason: "large_tool_result",
        }
        : {
            type: params.normalizedRawType,
            output: params.reference,
            externalizedFileId: params.fileId,
            originalByteSize: params.byteSize,
            toolOutputExternalized: true,
            externalizationReason: "large_tool_result",
        };
    if (params.callId) {
        if (params.normalizedRawType === "function_call_output") {
            block.call_id = params.callId;
        }
        else {
            block.tool_use_id = params.callId;
        }
    }
    if (typeof params.recordIsError === "boolean") {
        block.is_error = params.recordIsError;
    }
    else if (typeof params.recordIsErrorCamel === "boolean") {
        block.isError = params.recordIsErrorCamel;
    }
    else if (typeof params.topLevelIsError === "boolean") {
        block.isError = params.topLevelIsError;
    }
    if (params.toolName) {
        block.name = params.toolName;
    }
    return block;
}
