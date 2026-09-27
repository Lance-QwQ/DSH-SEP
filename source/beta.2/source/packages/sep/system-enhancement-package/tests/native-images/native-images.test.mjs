import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
assert.ok(process.env.SEP_IMAGE_HOST,'Set SEP_IMAGE_HOST to the pinned rc.2 Beta fixture.');
const root=resolve(process.env.SEP_IMAGE_HOST),bytes=await readFile(join(root,'graph.json'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'7ccb8c88330c3f2f576bc3bc50b0e235ea1e0ee28e7fd772521039b213e4f0e5');
const graph=JSON.parse(bytes),zod=graph.packages.find(p=>p.name==='zod');
for(const f of graph.files.filter(f=>f.path.startsWith(`store/${zod.id}/`)))assert.equal(createHash('sha256').update(await readFile(join(root,f.path))).digest('hex'),f.sha256);
registerHooks({resolve(specifier,context,next){return specifier==='zod'?{url:pathToFileURL(join(root,'store',zod.id,'index.js')).href,shortCircuit:true}:next(specifier,context);}});
const {installP1,p1Config}=await import('../../src/p1.js');
const {safeP1Failure}=await import('../../src/p1-failures.js');
const text={type:'text',text:'Inspect the synthetic fixture.'};
const image={type:'image',attachment:{attachmentId:'sha256:'+ 'a'.repeat(64),mediaType:'image/png',bytes:1000,width:42,height:42}};
const request=(content=[text,image],overrides={})=>({provider:'deepseek-official',model:'deepseek-flash',maxTokens:32,messages:[{role:'user',content}],...overrides});
async function setup(t,options={}){
 const dir=await mkdtemp(join(tmpdir(),'sep-native-image-unit-'));t.after(async()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+'\\'));await rm(dir,{recursive:true,force:true});});
 const listeners=new Map(),effects=[],budgetPath=join(dir,'budget.json');
 const llm={resolveModelInfo:options.resolveModelInfo??(async()=>({id:'deepseek-flash',inputModalities:['text','image'],...options.info})),imageRequestPricing:()=>options.pricing===null?undefined:{priceImages:images=>options.prices??images.map(b=>({visualTokens:b.offloaded===true?0:1024,text:b.offloaded===true?'offloaded':'handle'}))}};
 const ctx={llm,get:n=>n==='attachments'&&options.attachments===false?undefined:n==='llm'?llm:{},on:(n,f)=>listeners.set(n,f),effect:f=>effects.push(f()),subagents:{getProvider:()=>({})},tools:{guard:()=>{}}};
 await installP1(ctx,{config:p1Config.parse({enabled:true,budgetPath,...options.config}),scope:{projects:[]},store:{},signal:new AbortController().signal,track:()=>{}});
 let entries=0;const run=async req=>{const chunks=[];for await(const chunk of listeners.get('llm/stream')(req,async function*(){entries++;yield {type:'usage',usage:{inputTokens:1,outputTokens:1}};yield {type:'finish',reason:{kind:'stop'}};}))chunks.push(chunk);return chunks;};
 return {run,budgetPath,dispose:()=>effects.forEach(f=>f()),entries:()=>entries,ledger:async()=>JSON.parse(await readFile(budgetPath,'utf8'))};
}
// These cases fail if the old blanket rejection returns, or if valid image input is dropped.
for(const role of ['user','tool'])test(`${role} native image reaches the next provider and settles its ledger entry`,async t=>{
 const f=await setup(t),r=request();r.messages=[{role,content:[text,image]}];const chunks=await f.run(r);
 assert.equal(chunks.at(-1).reason.kind,'stop');assert.equal(f.entries(),1);assert.equal((await f.ledger()).entries[0].status,'settled');assert.deepEqual(r.messages[0].content,[text,image]);
});
test('an advertised legacy Flash image route uses its own capability rather than the separate suite_vision whitelist',async t=>{
 const f=await setup(t);await f.run(request(undefined,{model:'deepseek-v4-flash'}));assert.equal(f.entries(),1);
});
test('offloaded-only history reaches a text route without restoring image input',async t=>{
 const f=await setup(t,{info:{inputModalities:['text']},attachments:false}),block={...image,offloaded:true},r=request([text,block],{model:'deepseek-v4-pro'});
 await f.run(r);assert.equal(f.entries(),1);assert.equal(r.messages[0].content[1].offloaded,true);
});
test('duplicate image occurrences each reserve their visual tokens and handle text',async t=>{
 const f=await setup(t),one=request(),two=request([text,image,image]);await f.run(one);await f.run(two);const [a,b]=(await f.ledger()).entries;
 const metadataDelta=Buffer.byteLength(JSON.stringify(two))-Buffer.byteLength(JSON.stringify(one));
 assert.ok(Math.abs((b.reservedCny-a.reservedCny)-(metadataDelta+1024+6)*3/1000000)<0.00000101);
});
test('offloaded image reserves placeholder text without visual tokens',async t=>{
 const f=await setup(t),r=request([text,{...image,offloaded:true}]);await f.run(r);const [entry]=(await f.ledger()).entries;
 assert.equal(entry.reservedCny,Math.ceil(((Buffer.byteLength(JSON.stringify(r))+16384+9)*3+32*9)-1e-9)/1000000);
});
for(const [name,opts] of [['text-only',{info:{inputModalities:['text']}}],['unknown modality',{info:{inputModalities:undefined}}],['no attachment service',{attachments:false}]])test(`${name} refuses retained images before a reservation or provider call`,async t=>{
 const f=await setup(t,opts);await assert.rejects(f.run(request()),{code:'P1_IMAGE_NOT_ALLOWED'});assert.equal(f.entries(),0);assert.deepEqual((await f.ledger()).entries,[]);
});
for(const [name,opts] of [['missing pricing',{pricing:null}],['wrong count',{prices:[]}],['fractional tokens',{prices:[{visualTokens:1.5,text:'handle'}]}],['negative tokens',{prices:[{visualTokens:-1,text:'handle'}]}],['no visual tokens',{prices:[{visualTokens:0,text:'handle'}]}],['oversized token price',{prices:[{visualTokens:1025,text:'handle'}]}],['missing text',{prices:[{visualTokens:1024}]}]])test(`${name} cannot bypass image budget accounting`,async t=>{
 const f=await setup(t,opts);await assert.rejects(f.run(request()),{code:'BUDGET_ESTIMATE'});assert.equal(f.entries(),0);assert.deepEqual((await f.ledger()).entries,[]);
});
test('offloaded image pricing cannot charge it as a restored image',async t=>{
 const f=await setup(t,{prices:[{visualTokens:1024,text:'offloaded'}]});await assert.rejects(f.run(request([text,{...image,offloaded:true}])),{code:'BUDGET_ESTIMATE'});assert.equal(f.entries(),0);
});
test('image-inclusive reservation rejects budget exhaustion before provider dispatch',async t=>{
 const r=request(),textOnlyEstimate=((Buffer.byteLength(JSON.stringify(r))+16384)*3+32*9)/1000000;
 const f=await setup(t,{config:{limitCny:textOnlyEstimate+0.001}});await assert.rejects(f.run(r),{code:'BUDGET_EXCEEDED'});assert.equal(f.entries(),0);assert.deepEqual((await f.ledger()).entries,[]);
});
for(const [name,overrides,expected] of [['provider',{provider:'unreviewed'},'P1_MODEL_NOT_ALLOWED'],['model',{model:'unreviewed'},'P1_MODEL_NOT_ALLOWED'],['output',{maxTokens:2049},'P1_OUTPUT_LIMIT'],['input',{messages:[{role:'user',content:[{type:'text',text:'x'.repeat(250001)},image]}]},'P1_INPUT_LIMIT']])test(`existing ${name} limit still stops image requests`,async t=>{
 const f=await setup(t);await assert.rejects(f.run(request(undefined,overrides)),{code:expected});assert.equal(f.entries(),0);
});
test('text-only requests do not require image services',async t=>{
 const f=await setup(t,{attachments:false,pricing:null});await f.run(request([text]));assert.equal(f.entries(),1);
});
test('the existing failure tracker preserves image and budget refusal codes',()=>{
 assert.equal(safeP1Failure({code:'P1_IMAGE_NOT_ALLOWED'},'test','test').code,'P1_IMAGE_NOT_ALLOWED');assert.equal(safeP1Failure({code:'BUDGET_ESTIMATE'},'test','test').code,'BUDGET_ESTIMATE');
});

for(const kind of ['user cancellation','plugin disposal'])test(`${kind} during capability resolution leaves no reservation or dispatch`,async t=>{
 let entered,release;const began=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const controller=new AbortController();
 const f=await setup(t,{resolveModelInfo:async()=>{entered();await gate;return {inputModalities:['text','image']};}});
 const pending=f.run(request(undefined,{signal:controller.signal}));await began;if(kind==='user cancellation')controller.abort();else f.dispose();release();
 await assert.rejects(pending,{code:'ABORTED'});assert.equal(f.entries(),0);assert.deepEqual((await f.ledger()).entries,[]);
});
test('a small projected image still reserves the full reviewed per-image ceiling',async t=>{
 const f=await setup(t,{prices:[{visualTokens:17,text:'handle'}]}),r=request();await f.run(r);const [entry]=(await f.ledger()).entries;
 assert.equal(entry.reservedCny,Math.ceil(((Buffer.byteLength(JSON.stringify(r))+16384+6+1024)*3+32*9)-1e-9)/1000000);
});
