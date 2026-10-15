// Compile actual emitted carrier expressions, not just the outer module.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {Script,createContext} from 'node:vm';
const selected=process.env.SEP_RENDERER_GRAMMAR_SOURCE??'native-dom-r4.mjs';
assert(['native-dom-r3.mjs','native-dom-r4.mjs'].includes(selected));
const source=await readFile(new URL(selected,import.meta.url),'utf8');
const worker=await readFile(new URL('./native-worker-r5.mjs',import.meta.url),'utf8');
const literals=s=>[...s.matchAll(/`([^`]*)`/gs)].map(m=>m[1]);
const dom=literals(source),main=literals(worker);
assert.equal(dom.length,20);assert.equal(main.length,4);
const preview=dom.filter(t=>t.includes('r.dataset.reviewSha256'));assert.equal(preview.length,1);
const bindings={expression:'true',nonce:'fixture-nonce',windowId:1,code:'true',modal:'document.querySelector("modal")',panel:'document.querySelector("panel")',review:'document.querySelector("review")',label:'取消预览',asar:'/fixture/app.asar',welcomeUrl:'file:///fixture/welcome.html',script:'true',id:1,envelope:'true'};
const emit=raw=>Function(...Object.keys(bindings),'return `'+raw+'`')(...Object.values(bindings));

test('the actual preview template compiles and joins observed diff blocks with a newline',()=>{
 const compiled=new Script(emit(preview[0]));
 const button={textContent:'确认提交…'},proof={dataset:{reviewId:'fixture-review',reviewSha256:'a'.repeat(64)},querySelectorAll(selector){return selector==='button'?[button]:[{textContent:'candidate fixture'},{textContent:'original'}];}};
 const value=compiled.runInContext(createContext({E:()=>true,document:{querySelector:()=>proof}}),{timeout:1000});
 assert.equal(value.id,'fixture-review');assert.equal(value.sha256,'a'.repeat(64));
 assert.equal(value.text,'candidate fixture\noriginal');
});

test('all nineteen other actual DOM carrier templates remain syntactically valid',()=>{
 let count=0;for(const raw of dom){if(raw===preview[0])continue;new Script(emit(raw));count++;}assert.equal(count,19);
});

test('all four unchanged Inspector/main renderer-envelope templates compile',()=>{
 for(const raw of main)new Script(emit(raw));
});
