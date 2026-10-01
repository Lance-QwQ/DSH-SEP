/** Structured CLI failure with a machine-readable code and process exit status. */
export class CliError extends Error {
    code;
    exitCode;
    details;
    constructor(code, message, exitCode, details) {
        super(message);
        this.code = code;
        this.exitCode = exitCode;
        this.details = details;
        this.name = "CliError";
    }
}
/** Build the stable success envelope used by every JSON command response. */
export function createSuccessEnvelope(command, data, meta, pagination) {
    return {
        ok: true,
        command,
        data,
        ...(pagination ? { pagination } : {}),
        meta,
    };
}
/** Build the stable error envelope written to stderr for expected failures. */
export function createErrorEnvelope(error) {
    return {
        ok: false,
        error: {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details }),
        },
    };
}
/** Convert an unexpected thrown value into a stable internal CLI error. */
export function normalizeCliError(error) {
    if (error instanceof CliError) {
        return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new CliError("INTERNAL_ERROR", message || "Unexpected CLI failure.", 1);
}
// Render one scalar or nested value as a single table cell.
function renderCell(value) {
    if (value === null || value === undefined) {
        return "null";
    }
    const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
    return rendered.replace(/[\t\r\n]+/g, " ");
}
// Render a bounded array of records with deterministic first-seen columns.
function renderRows(rows) {
    if (rows.length === 0) {
        return ["(no rows)"];
    }
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return [
        columns.join("\t"),
        ...rows.map((row) => columns.map((column) => renderCell(row[column])).join("\t")),
    ];
}
// Render nested command data as stable key/value lines when it is not a list.
function renderObject(prefix, value) {
    return Object.entries(value).map(([key, child]) => `${prefix}${key}\t${renderCell(child)}`);
}
/** Serialize one success envelope as JSON or compact tabular text. */
export function renderSuccessEnvelope(envelope, format, pretty) {
    if (format === "json") {
        return `${JSON.stringify(envelope, null, pretty ? 2 : undefined)}\n`;
    }
    const lines = [`command\t${envelope.command}`];
    const data = envelope.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
        const record = data;
        if (Array.isArray(record.items)) {
            lines.push(...renderRows(record.items));
            const otherData = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "items"));
            lines.push(...renderObject("data.", otherData));
        }
        else {
            lines.push(...renderObject("data.", record));
        }
    }
    else {
        lines.push(`data\t${renderCell(data)}`);
    }
    if (envelope.pagination) {
        lines.push(...renderObject("pagination.", envelope.pagination));
    }
    lines.push(...renderObject("meta.", envelope.meta));
    return `${lines.join("\n")}\n`;
}
