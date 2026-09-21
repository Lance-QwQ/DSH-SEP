import type { FileDiff } from '@deepseek-ai/dsh-tools';
/** Bounded, detached text supplied after the filesystem reports a successful mutation. */
export interface DiffInput {
    path: string;
    before: string | null;
    after: string;
}
/** Produce the same contextual hunks as the original file tool.
 * @param input - plain JSON text and display path; no filesystem capabilities.
 * @returns contextual hunks, or a create/full-replacement preview when no basis exists.
 */
export declare function execute(input: DiffInput): {
    diffs: FileDiff[];
};
