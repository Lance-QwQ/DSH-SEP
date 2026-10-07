import { EntryGroup, EntryTree, type EntryOptions } from '@deepseek-ai/cordis-plugin-loader';
import { Context, Service } from '@deepseek-ai/cordis';
import * as yaml from 'js-yaml';
/**
 * The entry-list YAML dialect: `!!js` scalars round-trip as expression nodes
 * the Loader evaluates at entry activation. Exported so config tooling
 * (`dsh --dump-config`) parses and prints exactly the dialect this include
 * mounts.
 */
export declare const entryListSchema: yaml.Schema;
/**
 * Apply patch lists to an entry list — THE patch semantics of this include,
 * shared by mounting (`applyPatches`) and offline config tooling
 * (`dsh --dump-config`) so a dump can never drift from what boots. The input
 * is never mutated: patching shared entry objects would bake earlier patch
 * values into the cached parse, so repeated application (config hot-reloads)
 * could never revert a removed or changed patch. Inserted entries are indexed
 * as they are added, so a later patch in the same list can target a row an
 * earlier patch inserted. A patch that matches nothing warns and is skipped.
 * @param data - the parsed entry list (JSON-safe plain data).
 * @param patches - the patch list to apply, in order.
 * @param warn - sink for skipped-patch diagnostics (printf-style, `%C` = code).
 * @returns a detached entry list with every applicable patch applied.
 */
export declare function applyEntryPatches(data: EntryOptions[], patches: PatchOptions[] | undefined, warn: (message: string, ...args: any[]) => void): EntryOptions[];
/** Runtime patch applied to entries loaded from an included config file. */
export interface PatchOptions {
    id?: string;
    insert?: EntryOptions[];
    name?: string;
    config?: any;
    group?: boolean | null;
    disabled?: boolean | null;
    inject?: any;
    intercept?: any;
    isolate?: any;
    [key: string]: any;
}
/** Config namespace for the file-backed include loader. */
export declare namespace Include {
    /** Config for a file-backed loader subtree. */
    interface Config {
        /** YAML or JSON path resolved from `ctx.baseUrl`. */
        path: string;
        /** Entry list written when the file does not already exist. */
        initial?: any[];
        /** Runtime patches applied after reading the file. */
        patches?: PatchOptions[];
        /** Enables loader apply/reload/unload logs for this subtree. */
        enableLogs?: boolean;
    }
}
/** Loader entry tree backed by a YAML or JSON file. */
export declare class Include extends EntryTree {
    config: Include.Config;
    static inject: string[];
    static readonly [EntryGroup.key] = true;
    filename: string;
    private type?;
    private readonly;
    private content?;
    private data?;
    private writeTask?;
    private pendingWrite?;
    private writeQueue;
    constructor(ctx: Context, config: Include.Config);
    private checkAccess;
    private read;
    private applyPatches;
    [Service.init](): AsyncGenerator<() => Promise<void>, void, unknown>;
    stop(): Promise<void>;
    /**
     * Re-read the file and refresh child entries when content changed. An
     * unreadable or unparsable file logs a warning and keeps the last good
     * tree: a hot-reload of a live app must never take the process down.
     */
    refresh(): Promise<void>;
    private _writeFile;
    private writeFile;
    private flushWrite;
    /** Schedule a write of the current root entry data. */
    write(): void;
}
export default Include;
//# sourceMappingURL=index.d.ts.map