import {BasicCompactionEngine} from '@deepseek-ai/dsh-compaction-basic';
import {z} from 'zod';
import {createLosslessCompaction} from './lossless-compaction.mjs';

export const name='dsh-sep-lossless-compaction';
export const inject=['llm','tokenMeter','sessions','suiteEnhancements'];
export const provide=['compaction'];
const schema=z.object({
  projects:z.array(z.object({id:z.string(),root:z.string()}).strict()).min(1).max(16),
  maxInputBytes:z.number().int().min(1024).max(8*1024*1024).default(8*1024*1024),
  native:z.record(z.string(),z.unknown()).default({}),
}).strict();

export async function apply(ctx,input){
  if(ctx.get('compaction'))throw Error('LOSSLESS_ENGINE_ALREADY_PRESENT');
  const config=schema.parse(input);
  const Engine=await createLosslessCompaction(BasicCompactionEngine,config);
  await ctx.plugin(Engine,config.native);
}
