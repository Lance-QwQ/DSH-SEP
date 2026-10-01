/**
 * dsh-jobs' owned branded id, carried across the registry, the model-facing
 * control surface, and the client wire.
 *
 * It lives in its own leaf because the package root and `./types` both reach
 * `dsh-agent` through the owner and listener signatures, which a Client program
 * cannot resolve even as a type. A browser-safe consumer imports the id here;
 * `Branded<B>` itself comes from the zero-dependency `@deepseek-ai/dsh-brand`.
 *
 * @module @deepseek-ai/dsh-jobs/brand
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/**
 * Identifies a background job. Consumers treat the returned string as opaque.
 * Registry implementations prevent identity reuse across instances; access
 * still relies on owner authorization rather than knowledge of the id.
 */
export type JobId = Branded<'JobId'>

/**
 * Brand a string as a {@link JobId}.
 * @param id - the complete opaque string returned by the registry.
 * @returns the same string, branded; no validation is performed.
 */
export function JobId(id: string): JobId {
  return id as JobId
}
