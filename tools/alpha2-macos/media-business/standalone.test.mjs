import {readFile} from 'node:fs/promises';
import {hash} from '../business/bounded-read.mjs';
const file=new URL('../business/standalone.test.mjs',import.meta.url);let source=await readFile(file,'utf8');if(hash(source)!=='df88909b01ec71b0611e4a66a4a829016553219b844f8b0a0fb1e96a185a7b9e')throw Error('MEDIA_STANDALONE_TEST_ORIGIN_CHANGED');
const swaps=[
 ['real native macOS official web profile','real native macOS image web profile'],
 ['SEP_MAC_BUSINESS_TEST_ROOT','SEP_MAC_MEDIA_TEST_ROOT',2],
 ["assert.equal(ready.authenticatedUrlPresent,true);","assert.equal(ready.authenticatedUrlPresent,true);assert.deepEqual(ready.settings,{status:'pass',fiberActive:true,clientAdvertised:true,staticClientServed:true,memoryAvailable:true,budgetAvailable:true});"],
 ['helperSha256:hash(await readFile(process.env.SEP_MAC_TREE_HELPER)),initialize:true','helperSha256:hash(await readFile(process.env.SEP_MAC_TREE_HELPER)),attachmentHelperPath:process.env.SEP_MAC_ATTACHMENT_HELPER,attachmentHelperSha256:hash(await readFile(process.env.SEP_MAC_ATTACHMENT_HELPER)),initialize:true'],
 ["new URL('./standalone-probe.mjs',import.meta.url)","new URL("+JSON.stringify(new URL('./standalone-probe.mjs',import.meta.url).href)+")"],
 ['import.meta.url',JSON.stringify(import.meta.url)],
];
for(const [before,after,count=1]of swaps){if(source.split(before).length-1!==count)throw Error('MEDIA_STANDALONE_TEST_ANCHOR '+before);source=source.split(before).join(after);}
source=source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?"from '"+new URL(path,file).href+"'":all);
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
