export const name='dsh-sep-recovery-composition';
export const inject=['tools','fs','storageDomain','recoveryHost'];
export async function apply(ctx,config){const suite=await import('dsh-system-enhancement-package');await ctx.plugin(suite,config);}
