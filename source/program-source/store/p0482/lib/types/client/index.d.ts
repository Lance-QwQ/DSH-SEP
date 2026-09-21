import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type MemoryUiConfig } from '../config.ts';
export { Config } from '../config.ts';
export type { MemorySettingsSectionInjected, MemorySettingsSectionProps } from './MemorySettingsSection.tsx';
export type { MemoryUiConfig } from '../config.ts';
/** Native slot, locale and private transport dependencies. */
export declare const inject: string[];
/** Register one project memory settings section without adding a session mode. */
export declare function apply(ctx: ClientContext, config?: MemoryUiConfig): void;
