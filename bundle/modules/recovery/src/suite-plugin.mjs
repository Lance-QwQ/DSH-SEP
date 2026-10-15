export const name='dsh-sep-recovery-composition';
export const inject=['tools','fs','storageDomain','recoveryHost'];
export async function apply(ctx,config){const suite=await import("../../system-enhancement-package/src/index.js");await ctx.plugin(suite,config);}
