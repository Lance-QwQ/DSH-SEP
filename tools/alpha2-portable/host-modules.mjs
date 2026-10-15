import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const host=resolve(process.env.SEP_OFFICIAL_HARNESS??join(process.env.SEP_PORTABLE_ROOT,'host'));
const require=createRequire(join(host,'package.json'));
export const load=name=>import(pathToFileURL(require.resolve(name)));
export async function prerequisites(ctx){
 for(const name of ['@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-session-projection','@deepseek-ai/dsh-session','@deepseek-ai/dsh-llm','@deepseek-ai/dsh-agent'])await ctx.plugin((await load(name)).default);
 await ctx.plugin((await load('@deepseek-ai/dsh-agent-loop')).default,{agents:[]});
}
