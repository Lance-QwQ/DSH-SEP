/** Shared text or byte reads, or content loading owned by the renderer. */
export type DocumentLoadMode = 'text-pages' | 'bytes-complete' | 'renderer';
/** One renderer implementation, independent of its component registration. */
export interface DocumentPreviewDefinition {
    /** Unique implementation name, also used as the document slot key. */
    readonly id: string;
    /** File suffixes without a leading dot; compound suffixes such as tar.gz are accepted. */
    readonly extensions: readonly string[];
    /**
     * Suffixes among `extensions` whose bytes are not readable text; a file
     * matching one loses the plain-text fallback among its viewer choices.
     * Every entry must appear in `extensions`; `register` rejects strays.
     */
    readonly binaryExtensions?: readonly string[];
    /** External implementations win over product implementations; defaults to extension. */
    readonly priority?: 'builtin' | 'extension';
    /** Localized implementation label, evaluated when the toolbar renders. @returns the visible name. */
    readonly title: () => string;
    /** Content delivery mode supplied by the document owner. */
    readonly loading: DocumentLoadMode;
    /** Whether the implementation consumes the document's wrap preference. */
    readonly wrap?: boolean;
}
/**
 * Rank an observed definition snapshot without consulting mutable service state.
 * @param definitions - registered implementations in registration order.
 * @param path - decoded filename or file path.
 * @returns matching implementations, external band first, then longest suffix.
 */
export declare function matchingDocumentPreviews(definitions: readonly DocumentPreviewDefinition[], path: string): readonly DocumentPreviewDefinition[];
/**
 * Whether any registered implementation declares the filename's suffix binary.
 * @param definitions - registered implementations.
 * @param path - decoded filename or file path.
 * @returns true when a declared binary suffix matches the filename.
 */
export declare function binaryDocumentPath(definitions: readonly DocumentPreviewDefinition[], path: string): boolean;
/** Observable registry of all live implementations, including lower-priority alternatives. */
export declare class DocumentPreviewRegistry {
    private readonly registered;
    private readonly listeners;
    private snapshot;
    /**
     * Read the current registrations.
     * @returns the same snapshot until a registration changes.
     */
    readonly getSnapshot: () => readonly DocumentPreviewDefinition[];
    /**
     * Observe registration changes.
     * @param listener - registration-change observer.
     * @returns its disposer.
     */
    readonly subscribe: (listener: () => void) => (() => void);
    /**
     * Register metadata separately from the matching keyed slot component.
     * @param definition - unique implementation and recognized suffixes; every
     * `binaryExtensions` entry must appear in `extensions`.
     * @returns an idempotent disposer; duplicate live implementation names and
     * binary suffixes outside `extensions` throw.
     */
    register(definition: DocumentPreviewDefinition): () => void;
    /**
     * List every matching implementation in automatic-selection order.
     * @param path - decoded file path; matching never resolves filesystem access.
     * @returns extension band first, then longest suffix, then registration order.
     */
    candidates(path: string): readonly DocumentPreviewDefinition[];
    private publish;
}
//# sourceMappingURL=registry.d.ts.map