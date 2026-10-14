// Cold dependency order only: the actual LLM service is official bytes.
import {load} from '../business/host-modules.mjs';
export const name='sep-mac-after-attachments-llm';
export const inject=['attachments','sepMacAttachmentBinding'];
export const provide=['llm'];
export async function apply(ctx){await ctx.plugin((await load('@deepseek-ai/dsh-llm')).default);}
