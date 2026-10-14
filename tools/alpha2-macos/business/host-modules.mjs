import {createRequire} from 'node:module';
import {join,resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
if(!process.env.SEP_OFFICIAL_HARNESS||!isAbsolute(process.env.SEP_OFFICIAL_HARNESS))throw Error('SEP_MAC_HOST_PATH');
export const host=resolve(process.env.SEP_OFFICIAL_HARNESS),require=createRequire(join(host,'package.json'));
const manifest=JSON.parse(await readFile(require.resolve('@deepseek-ai/dsh/package.json'),'utf8'));
if(manifest.version!=='0.2.1-alpha.2')throw Error('SEP_MAC_HOST_VERSION');
export const load=name=>import(pathToFileURL(require.resolve(name)));
export async function prerequisites(ctx){
 for(const name of ['@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-session-projection','@deepseek-ai/dsh-session','@deepseek-ai/dsh-llm','@deepseek-ai/dsh-agent'])await ctx.plugin((await load(name)).default);
 await ctx.plugin((await load('@deepseek-ai/dsh-agent-loop')).default,{agents:[]});
}
