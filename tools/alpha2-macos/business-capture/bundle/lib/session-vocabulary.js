export * from '@deepseek-ai/dsh-session';
import {KNOWN_SESSION_EVENT_TYPES as nativeTypes} from '@deepseek-ai/dsh-session';

// A private set for the owned JSONL provider. Never mutate the host's set.
export const SEP_SESSION_EVENT_TYPES=new Set(['task/checkpoint-change','recovery/continuation']);
export const KNOWN_SESSION_EVENT_TYPES=new Set([...nativeTypes,...SEP_SESSION_EVENT_TYPES]);
