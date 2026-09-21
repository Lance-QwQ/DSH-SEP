export type ConversionErrorCode = 'input-too-large' | 'output-too-large' | 'invalid-document' | 'unsupported-format' | 'invalid-output' | 'timeout' | 'unavailable' | 'failed';
export declare class ConversionError extends Error {
  readonly code: ConversionErrorCode;
  readonly cleanupIncomplete?: boolean;
  readonly diagnostics?: { stdout: string; stderr: string };
  constructor(code: ConversionErrorCode, message: string, options?: ErrorOptions);
}
export interface ConverterOptions {
  timeoutMs?: number;
  maxInputBytes?: number;
  maxOutputBytes?: number;
  maxImageResolution?: number;
  maxArchiveEntries?: number;
  maxUncompressedBytes?: number;
  /** Only legacy default 20000 is accepted; CLI fonts are OS-managed. */
  maxFontFiles?: 20000;
  /** Only legacy default 268435456 is accepted; CLI fonts are OS-managed. */
  maxFontFileBytes?: 268435456;
  /** Only legacy default 536870912 is accepted; CLI fonts are OS-managed. */
  maxLoadedFontBytes?: 536870912;
  /** Custom font options are rejected; use Windows installed fonts. */
  fontDirectories?: never;
  fontFallbacks?: never;
  initialFontFamilies?: never;
  /** Optional absolute executable override for a trusted local LibreOffice install. No PATH search. */
  executablePath?: string;
  /** Existing caller-owned absolute directory; generated job directories are removed after each settled request. */
  workRoot?: string;
}
export interface RenderResult { readonly backend: 'native'; readonly missingFonts: string[]; readonly fontDiagnostics: 'unavailable'; }
export interface Converter {
  readonly backend: 'native';
  /** Caller authorizes input and owns both parent directories, preventing concurrent path mutation. Fresh PDF output only. */
  render(request: { inputPath: string; outputPath: string }, signal?: AbortSignal): Promise<RenderResult>;
  /** Permanently close admission, abort accepted work, and await owned process and normal temporary-file cleanup. */
  dispose(): Promise<void>;
}
export declare function createConverter(options?: ConverterOptions): Promise<Converter>;
