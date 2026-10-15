// Frozen public-snapshot semantics, Linux execution carrier. Python receives
// serialized data and a hash-bound AST parser; supplied source is never run.
import {readFile,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {bundleRoot} from './bundle-modules.mjs';
import {hash,fail} from './project-tree.mjs';
import {alpha2ContextSource,contextDerivation} from './context-origin.mjs';
export {contextDerivation};
export const origin=Object.freeze({path:'bundle/host/context-preparation/index.mjs',sha256:'32364edece8f70a972d784c051b6da256c2ab3cb074232be078fec551928a1de',transformations:[
 ['export async function apply(ctx,config={},ownership){','export async function apply(ctx,config={},ownership,parseSnapshot=parse){'],
 ['const result=await parse(python,{files:s.input.files,seeds:args.seeds,roots:args.roots},signal);','const result=await parseSnapshot(python,{files:s.input.files,seeds:args.seeds,roots:args.roots},signal);'],
],parser:{path:'bundle/modules/context-preparation/context_resolver.py',sha256:'a5ecf6c75e891d4973a1e5bf0395f9eb18a632c109e8c1ac3944b865b11bc38d'}});
let source=alpha2ContextSource(await readFile(join(bundleRoot,origin.path),'utf8'));if(hash(source)!==origin.sha256)fail('SEP_LINUX_CONTEXT_ORIGIN_CHANGED');
for(const [before,after]of origin.transformations){if(source.split(before).length!==2)fail('SEP_LINUX_CONTEXT_TRANSFORM');source=source.replace(before,after);}
export const transformedSha256=hash(source);
const original=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
export function linuxContextPreparation(carrier){return {...original,async apply(ctx,config,ownership){
 if(config.python!=='/usr/bin/python3')fail('CONTEXT_CONFIG');
 // Linux paths are case sensitive. The captured Windows-compatible adapter
 // keeps its original bytes; enforce exact canonical paths before mounting it.
 for(const snapshot of config.snapshots)for(const path of [snapshot.root,snapshot.path])if(resolve(path)!==path||await realpath(path)!==path)fail('CONTEXT_CANONICAL_PATH');
 const parser=await readFile(join(bundleRoot,origin.parser.path),'utf8');if(hash(parser)!==origin.parser.sha256)fail('SEP_LINUX_CONTEXT_PARSER_CHANGED');
 return original.apply(ctx,config,ownership,async(_python,payload,signal)=>{
  const input=JSON.stringify(payload);if(Buffer.byteLength(input)>10*1024*1024)fail('CONTEXT_INPUT_LIMIT');
  const output=await carrier.parseContext({code:parser,input,signal});signal.throwIfAborted();
  try{return JSON.parse(output);}catch{fail('CONTEXT_PARSER_RESPONSE');}
 });
}};}
