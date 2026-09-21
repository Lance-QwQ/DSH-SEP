/** Explicit recoverable single-file operations over the provider's execution path. @module */
import type { Context } from '@deepseek-ai/cordis';
import { FsSandboxController } from './sandbox.ts';
/** Register managed mutations when the provider declares its recovery capability.
 * @param ctx - tool consumer context with filesystem and tool services.
 * @param sandbox - current composition's policy/escalation controller.
 */
export declare function applyManagedFileTools(ctx: Context, sandbox: FsSandboxController): void;
