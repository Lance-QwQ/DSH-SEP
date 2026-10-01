/** Explicit JSON-only HTML presentation module; performs no web, file or database access. */
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { convertFetchOutput } from './fetch.ts'

/**
 * Prepare the original renderer's complete output in the owned Worker.
 * @param args - Host-retrieved value and the existing output character limit.
 * @returns The complete rendered text and effective truncation state.
 */
export function execute(args: { value: WebFetchResult; maxOutputChars: number }): { text: string; truncated: boolean } {
  return convertFetchOutput(args.value, args.maxOutputChars)
}
