import {realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {bundleRoot} from '../business/bundle-modules.mjs';
import {frozen,transform,cut,evaluate,fail} from './derive.mjs';
export const origin=Object.freeze({path:'bundle/host/context-preparation/index.mjs',sha256:'110c74099985b81caf70a285ecd9662a8f7ae0cf8902437ceb131fcbb4ceff29',alpha2Sha256:'32364edece8f70a972d784c051b6da256c2ab3cb074232be078fec551928a1de'});
const file=join(bundleRoot,origin.path),source=await frozen(file,origin.sha256);
const alpha2=transform(source,[{before:'session.header.cwd',after:"ctx.get('workingDirectory').get(session)",count:3}]);
if(alpha2.receipt.outputSha256!==origin.alpha2Sha256)fail('SEP_MAC_DOCUMENT_TRANSFORM');
const derived=transform(alpha2.source,[
 {before:"import {spawn} from 'node:child_process';\n",after:''},
 {before:"import {fileURLToPath} from 'node:url';\n",after:''},
 {before:'isAbsolute,relative,resolve,toNamespacedPath',after:'isAbsolute,relative,resolve'},
 {before:cut(alpha2.source,'function parse(python,payload,signal){','export async function apply(ctx,config={},ownership){'),after:''},
 {before:'export async function apply(ctx,config={},ownership){',after:'export async function apply(ctx,config={},ownership,parseSnapshot){'},
 {before:'const python=await realpath(config.python),snapshots=[];',after:'const snapshots=[];'},
 {before:'const result=await parse(python,{files:s.input.files,seeds:args.seeds,roots:args.roots},signal);',after:'const result=await parseSnapshot({files:s.input.files,seeds:args.seeds,roots:args.roots},signal);'},
]);
export const derivation=Object.freeze({alpha2:alpha2.receipt,capability:derived.receipt});
const original=await evaluate(derived.source,file);
export async function macContextPreparation(services){
 if(typeof services?.parseContext!=='function'||typeof services.binding?.runtimeRoot!=='string')fail('SEP_MAC_CONTEXT_PARSER_REQUIRED');
 return Object.freeze({...original,async apply(ctx,config,ownership){
  if(config?.python!==join(services.binding.runtimeRoot,'tool-runtime/python/bin/python3.12'))fail('SEP_MAC_CONTEXT_BINDING');
  if(!Array.isArray(config.snapshots))fail('CONTEXT_CONFIG');
  for(const snapshot of config.snapshots)for(const path of [snapshot.root,snapshot.path])if(typeof path!=='string'||resolve(path)!==path||await realpath(path)!==path)fail('CONTEXT_CANONICAL_PATH');
  return original.apply(ctx,config,ownership,async(payload,signal)=>{
   const input=JSON.stringify(payload);if(Buffer.byteLength(input)>10*1024*1024)fail('CONTEXT_INPUT_LIMIT');signal.throwIfAborted();
   const output=await services.parseContext({input,signal});signal.throwIfAborted();
   try{return JSON.parse(output);}catch{fail('CONTEXT_PARSER_RESPONSE');}
  });
 }});
}
