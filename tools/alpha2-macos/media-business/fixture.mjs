// Explicit test-only derivation; the real business/Loader/core stay intact.
import {readFile} from 'node:fs/promises';
import {hash} from '../business/bounded-read.mjs';
const file=new URL('../business/fixture.mjs',import.meta.url);let text=await readFile(file,'utf8');if(hash(text)!=='1d5ab2a4a96b37655daf64bd5f275ae84a7706466718dd179e0fd438013977e2')throw Error('MEDIA_FIXTURE_ORIGIN_CHANGED');
const swaps=[
 ["import * as runtime from './runtime.mjs';","import * as runtime from '"+new URL('./runtime.mjs',import.meta.url).href+"';\nimport * as attachments from '"+new URL('./cold-attachments.mjs',import.meta.url).href+"';"],
 ["runtimeOptions={},loader=false}={})","runtimeOptions={},loader=false,imageCapable=true,imagePricing,agentMaxTokens=64}={})"],
 ["const helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));let ctx;","const helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));let ctx;\n if(!prior){const {createCanvas}=require('@napi-rs/canvas'),canvas=createCanvas(8,8),context=canvas.getContext('2d');context.fillStyle='#00ff00';context.fillRect(0,0,8,8);await writeFile(join(source,'图像.png'),canvas.toBuffer('image/png'),{mode:0o600});}\n const coldPrerequisites=async child=>{await child.plugin(attachments,{source,storageRoot:memory,initialize:!prior,helperPath:process.env.SEP_MAC_ATTACHMENT_HELPER,helperSha256:sha(await readFile(process.env.SEP_MAC_ATTACHMENT_HELPER))});await prerequisites(child);};\n const {deepSeekImageRequestPricing}=await load('@deepseek-ai/dsh-llm-deepseek');imagePricing??=(_p,model)=>deepSeekImageRequestPricing({models:[{id:model,inputModalities:['image']}]},model);"],
 ["ctx=await boot('dsh',file,[],prerequisites);","ctx=await boot('dsh',file,[],coldPrerequisites);"],
 ["ctx=new Context();await prerequisites(ctx);","ctx=new Context();await coldPrerequisites(ctx);"],
 ["context:{contextWindow:100000}};}async *stream(options)","context:{contextWindow:100000},...imageCapable?{inputModalities:['text','image']}:{}};}imageRequestPricing(provider,model){return imagePricing?.(provider,model);}async *stream(options)"],
 ["pluginGroup:true,media:false,...business","pluginGroup:true,media:false,vision:{enabled:true,allowUpload:true},...business"],
 ["new URL('./runtime.mjs',import.meta.url).href","'"+new URL('./runtime.mjs',import.meta.url).href+"'"],
 ["maxTokens:64}})).agent","...agentMaxTokens===null?{}:{maxTokens:agentMaxTokens}}})).agent"],
 ["setBehavior:fn=>{behavior=fn;},async close()","setBehavior:fn=>{behavior=fn;},setImageCapability:value=>{imageCapable=value;},setImagePricing:value=>{imagePricing=value;},async close()"],
 ["process.env.SEP_MAC_BUSINESS_TEST_ROOT","process.env.SEP_MAC_MEDIA_TEST_ROOT",2],
];
for(const [before,after,count=1]of swaps){if(text.split(before).length-1!==count)throw Error('MEDIA_FIXTURE_ANCHOR '+before);text=text.split(before).join(after);}
text=text.replace(/from '([^']+)'/g,(all,name)=>name.startsWith('.')?"from '"+new URL(name,file).href+"'":all);
export const {setup,ok}=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
