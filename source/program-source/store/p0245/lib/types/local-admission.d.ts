import type { SessionFormatCatalog } from '@deepseek-ai/dsh-session-format';
/** Validate task replay for both current and transformed reads, before live restoration can append events.
 * @param catalog - unmodified historical migration and codec assembly.
 * @returns a local catalog preserving physical and historical refusal rules.
 */
export declare function withLocalTaskAdmission(catalog: SessionFormatCatalog): SessionFormatCatalog;
