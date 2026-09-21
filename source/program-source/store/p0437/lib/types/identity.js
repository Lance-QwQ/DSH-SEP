/** Source locators and converter-owned identities for shared PDF reuse. */
import { brandString } from '@deepseek-ai/dsh-brand';
/**
 * Label an authorized source locator for pre-read deduplication.
 * @param key - unambiguous encoding of authorization scope, execution world, and canonical path.
 * @returns branded source locator; source authorization remains the caller's responsibility.
 */
export function OfficeSourceKey(key) { return brandString(key); }
/**
 * Label a provider lifetime.
 * @param value - unique generation created by the provider.
 * @returns branded converter generation.
 */
export function OfficeToPdfGeneration(value) {
    return brandString(value);
}
/**
 * Label a converter-owned content identity.
 * @param value - generation and content identity created by the provider.
 * @returns branded conversion identity.
 */
export function OfficeToPdfKey(value) { return brandString(value); }
//# sourceMappingURL=identity.js.map