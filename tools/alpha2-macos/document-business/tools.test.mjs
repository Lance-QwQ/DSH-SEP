import test from 'node:test';
import assert from 'node:assert/strict';
import {owned} from '../business/bundle-modules.mjs';

// The baseline mode runs the same refusal tests against the captured factory,
// proving that passing an additional option cannot confine its parser.
const baseline=process.env.SEP_DOCUMENT_BASELINE==='1';
const create=baseline?async services=>({
  ragTools:(scope,store,options)=>originalRag.ragTools(scope,store,{...options,parserServices:services}),
  mediaTools:(scope,store,options)=>originalMedia.mediaTools(scope,store,{...options,parserServices:services}),
}):(await import('./parsed-tools.mjs')).createParsedTools;
const originalRag=baseline?await owned('modules/system-enhancement-package/src/rag.js'):null;
const originalMedia=baseline?await owned('modules/system-enhancement-package/src/media.js'):null;
const error=code=>Object.assign(Error(code),{code});
const parserVersion='suite-parser-2/fflate-0.8.3/fxp-5.11.1/pdfjs-6.2.108/canvas-1.0.8';
function fixture({blocked=false}={}){
 const project={key:'synthetic'},signal=new AbortController().signal,bytes=Buffer.from('local fallback must never parse this text');let committed={},writes=0,reads=0;
 const scope={async files(){return ['sample.txt'];},async bytes(){reads++;if(blocked)throw error('DOCUMENT_EXCLUDED');return bytes;},isDocumentExcluded:()=>blocked};
 const store={read:()=>committed,async transaction(_project,operation){const draft=structuredClone(committed);const result=await operation(draft);committed=draft;writes++;return result;}};
 return {project,signal,scope,store,bytes,writes:()=>writes,reads:()=>reads,state:()=>committed};
}
test('extract must propagate the trusted parser refusal; no local fallback',async()=>{
 let calls=0;const f=fixture(),factories=await create({async parseDocument(){calls++;throw error('SYNTHETIC_PARSER_REFUSAL');}});
 await assert.rejects(()=>factories.mediaTools(f.scope,f.store,{}).extract(f.project,{path:'sample.txt'},{signal:f.signal}),{code:'SYNTHETIC_PARSER_REFUSAL'});assert.equal(calls,1);assert.equal(f.writes(),0);
});
test('RAG must propagate the trusted parser refusal and publish nothing',async()=>{
 let calls=0;const f=fixture(),factories=await create({async parseDocument(){calls++;throw error('SYNTHETIC_PARSER_REFUSAL');}});
 await assert.rejects(()=>factories.ragTools(f.scope,f.store).index(f.project,{},{signal:f.signal}),{code:'SYNTHETIC_PARSER_REFUSAL'});assert.equal(calls,1);assert.equal(f.writes(),0);assert.deepEqual(f.state(),{});
});
test('parser capability is mandatory and extraction never exposes the old paid vision path',async()=>{
 await assert.rejects(()=>create(),{code:'SEP_MAC_DOCUMENT_PARSER_REQUIRED'});
 const f=fixture(),factories=await create({async parseDocument(){throw error('unused');}});assert.deepEqual(Object.keys(factories.mediaTools(f.scope,f.store,{})),['extract']);
});
test('scope/P2 refusal occurs before invoking the trusted parser',async()=>{
 const f=fixture({blocked:true});let calls=0;const factories=await create({async parseDocument(){calls++;throw error('wrong order');}});
 for(const run of [()=>factories.mediaTools(f.scope,f.store,{}).extract(f.project,{path:'sample.txt'},{signal:f.signal}),()=>factories.ragTools(f.scope,f.store).index(f.project,{},{signal:f.signal})])await assert.rejects(run,{code:'DOCUMENT_EXCLUDED'});
 assert.equal(calls,0);assert.equal(f.writes(),0);
});
test('extract, index and search preserve the trusted response and reuse unchanged indexed bytes',async()=>{
 const f=fixture(),calls=[],parsed={parserVersion,parts:[{text:'trusted parser synthetic result',locator:{lineStart:1,lineEnd:1}}],warnings:['synthetic-warning']};
 const factories=await create({async parseDocument(input){calls.push(input);return structuredClone(parsed);}}),rag=factories.ragTools(f.scope,f.store),media=factories.mediaTools(f.scope,f.store,{});
 const extracted=await media.extract(f.project,{path:'sample.txt'},{signal:f.signal});assert.deepEqual(extracted.parts,parsed.parts);assert.deepEqual(extracted.warnings,parsed.warnings);assert.equal(extracted.trust,'untrusted_source_data');
 const indexed=await rag.index(f.project,{},{signal:f.signal});assert.equal(indexed.sources,1);const found=await rag.search(f.project,{query:'trusted',limit:5},{signal:f.signal});assert.equal(found.status,'found');assert.equal(found.hits[0].text,parsed.parts[0].text);
 await rag.index(f.project,{},{signal:f.signal});assert.equal(calls.length,2);for(const input of calls){assert.deepEqual(Object.keys(input).sort(),['bytes','extension','signal']);assert.equal(input.extension,'.txt');assert.equal(input.signal,f.signal);assert.deepEqual(input.bytes,f.bytes);}
});
test('cancellation after parser return cannot publish an index or an extraction',async()=>{
 const f=fixture(),controller=new AbortController(),factories=await create({async parseDocument(){controller.abort();return {parserVersion,parts:[{text:'must not publish',locator:{}}],warnings:[]};}});
 await assert.rejects(()=>factories.ragTools(f.scope,f.store).index(f.project,{},{signal:controller.signal}));assert.equal(f.writes(),0);assert.deepEqual(f.state(),{});
 const next=new AbortController(),extractors=await create({async parseDocument(){next.abort();return {parserVersion,parts:[],warnings:[]};}});
 await assert.rejects(()=>extractors.mediaTools(f.scope,f.store,{}).extract(f.project,{path:'sample.txt'},{signal:next.signal}));
});
