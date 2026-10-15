// Cold dependency order only; the LLM implementation remains official bytes.
import {load} from './host-modules.mjs';
export const name='sep-linux-after-attachments-llm';
export const inject=['attachments','sepLinuxAttachmentBinding'];
export const provide=['llm'];
export async function apply(ctx){await ctx.plugin((await load('@deepseek-ai/dsh-llm')).default);}
