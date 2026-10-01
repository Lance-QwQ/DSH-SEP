import type { SessionFormatArtifact, SessionFormatCatalog } from '@deepseek-ai/dsh-session-format';
/** Build-static catalog containing released codecs and the classified SEP extensions. */
export function createLocalSessionFormatCatalog(): SessionFormatCatalog;

/** Provenance of one source event through the frozen format-0 to format-3 migration. */
export interface LegacyEventMapping {
  sourceSeq: number;
  sourceType: string;
  sourceSha256: string;
  targetSeq: number;
  targetType: string;
  disposition: 'embedded-stream' | 'event';
}
/** Detached preview; this does not materialize the current host session format. */
export interface LegacyMigrationResult {
  artifact: SessionFormatArtifact;
  mapping: LegacyEventMapping[];
  generated: { seq: number; type: string; sha256: string }[];
  sourceSha256: string;
  targetSha256: string;
  execution: 'none';
  sourceModified: false;
}
/** Strictly validate and migrate supplied format-0 rows without writes or execution. */
export function migrateLegacyArtifact(physicalHeader: unknown, physicalRows: readonly unknown[]): LegacyMigrationResult;
