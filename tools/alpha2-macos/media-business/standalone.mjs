import {readFile} from 'node:fs/promises';
import {hash} from '../business/bounded-read.mjs';
const file=new URL('../business/standalone.mjs',import.meta.url);let source=await readFile(file,'utf8');
export const origin=Object.freeze({source:'../business/standalone.mjs',sha256:'e4ad150db13d7cf173826923f2d047c61c8762ff959b403eeee73fe01e7911c6'});
if(hash(source)!==origin.sha256)throw Error('SEP_MAC_MEDIA_STANDALONE_ORIGIN');
const substitutions=[
 ['const record=await initializeBusinessProfile(input),','await verifySettingsUi({hostRoot:input.hostRoot});\n const record=await initializeBusinessProfile(input),'],
 ["await ctx.workspaceRegistry.create(record.source,'DSH SEP macOS');","await ctx.workspaceRegistry.create(record.source,'DSH SEP macOS');\n  const settings=await assertSettingsMounted(ctx,{entryId:'mac-sep-settings',hostRoot:input.hostRoot});"],
 ['ready:{url:','ready:{settings,url:'],
];
for(const [before,after]of substitutions){if(source.split(before).length!==2)throw Error('SEP_MAC_MEDIA_STANDALONE_ANCHOR');source=source.replace(before,after);}
source=source.replace(/(?:from |import\()'([^']+)'/g,(all,path)=>{if(!path.startsWith('.'))return all;const target=path==='./profile-layout.mjs'?new URL(path,import.meta.url):new URL(path,file);return all.replace(path,target.href);});
source="import {verifySettingsUi} from '"+new URL('../settings-ui/adapter.mjs',import.meta.url).href+"';\nimport {assertSettingsMounted} from '"+new URL('../settings-ui/required.mjs',import.meta.url).href+"';\n"+source;
export const transformedSha256=hash(source);
export const {openMacBusiness}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
