import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, mkdir, link, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConverter } from '../index.js';
import { docx } from './zip-fixture.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const executablePath=process.env.SEP_OFFICE_EXE || join(here,'../../engine/runtime/program/soffice.com');
async function fixture(options={}) {
  const root=await mkdtemp(join(tmpdir(),'sep-converter-test-')),inputPath=join(root,'中文 & 空格.docx'),outputPath=join(root,'结果.pdf'),workRoot=join(root,'private-work');
  await mkdir(workRoot);await writeFile(inputPath,docx());
  return {root,inputPath,outputPath,workRoot,converter:await createConverter({executablePath,workRoot,...options})};
}
async function absent(path){await assert.rejects(access(path),e=>e.code==='ENOENT');}
async function empty(f){assert.deepEqual(await readdir(f.workRoot),[]);}

test('real Office conversion publishes a complete PDF and removes private files',async()=>{
  const f=await fixture();try{assert.deepEqual(await f.converter.render(f),{backend:'native',missingFonts:[],fontDiagnostics:'unavailable'});const pdf=await readFile(f.outputPath);assert.match(pdf.subarray(0,8).toString(),/^%PDF-/);assert.match(pdf.subarray(-1024).toString(),/%%EOF\s*$/);await empty(f);}finally{await f.converter.dispose();}
});
test('reject existing output without changing caller bytes',async()=>{
  const f=await fixture();await writeFile(f.outputPath,'keep');try{await assert.rejects(f.converter.render(f),e=>e.code==='invalid-output');assert.equal(await readFile(f.outputPath,'utf8'),'keep');await empty(f);}finally{await f.converter.dispose();}
});
test('reject hardlinked input before launching Office',async()=>{
  const f=await fixture();await link(f.inputPath,join(f.root,'second.docx'));try{await assert.rejects(f.converter.render(f),e=>e.code==='invalid-document');await absent(f.outputPath);await empty(f);}finally{await f.converter.dispose();}
});
test('reject junction input parent',async()=>{
  const f=await fixture(),junction=join(f.root,'junction');await symlink(f.root,junction,'junction');try{await assert.rejects(f.converter.render({...f,inputPath:join(junction,'中文 & 空格.docx')}),e=>e.code==='invalid-document');await absent(f.outputPath);}finally{await f.converter.dispose();}
});
test('reject junction output parent',async()=>{
  const f=await fixture(),junction=join(f.root,'junction');await symlink(f.root,junction,'junction');try{await assert.rejects(f.converter.render({...f,outputPath:join(junction,'bad.pdf')}),e=>e.code==='invalid-output');await empty(f);}finally{await f.converter.dispose();}
});
test('input byte budget is enforced before launch',async()=>{
  const f=await fixture({maxInputBytes:8});try{await assert.rejects(f.converter.render(f),e=>e.code==='input-too-large');await absent(f.outputPath);await empty(f);}finally{await f.converter.dispose();}
});
test('generated PDF above output budget is not published',async()=>{
  const f=await fixture({maxOutputBytes:100});try{await assert.rejects(f.converter.render(f),e=>e.code==='output-too-large');await absent(f.outputPath);await empty(f);}finally{await f.converter.dispose();}
});
test('deadline covers startup and removes the profile',async()=>{
  const f=await fixture({timeoutMs:100});try{await assert.rejects(f.converter.render(f),e=>e.code==='timeout');await absent(f.outputPath);await empty(f);}finally{await f.converter.dispose();}
});
test('pre-aborted render does not create a private job',async()=>{
  const f=await fixture(),controller=new AbortController();controller.abort();try{await assert.rejects(f.converter.render(f,controller.signal),e=>e.name==='AbortError');await absent(f.outputPath);await empty(f);}finally{await f.converter.dispose();}
});
test('cancel queued work promptly while the running real conversion remains usable',async()=>{
  const f=await fixture(),controller=new AbortController();try{const first=f.converter.render(f);const queued=f.converter.render({...f,outputPath:join(f.root,'queued.pdf')},controller.signal);const outcome=queued.catch(error=>error);controller.abort();const result=await Promise.race([outcome,new Promise(r=>setTimeout(()=>r('late'),200))]);assert.notEqual(result,'late');assert.equal(result.name,'AbortError');await first;await absent(join(f.root,'queued.pdf'));await empty(f);}finally{await f.converter.dispose();}
});
test('dispose aborts accepted work and permanently rejects new work',async()=>{
  const f=await fixture();const first=f.converter.render(f),second=f.converter.render({...f,outputPath:join(f.root,'queued.pdf')});const outcome=Promise.allSettled([first,second]);await f.converter.dispose();for(const result of await outcome){assert.equal(result.status,'rejected');assert.equal(result.reason.name,'AbortError');}await assert.rejects(f.converter.render(f),e=>e.code==='unavailable');await empty(f);await absent(f.outputPath);await f.converter.dispose();
});
test('same converter serializes concurrent actual Office conversions',async()=>{
  const f=await fixture();try{const second=join(f.root,'second.pdf');await Promise.all([f.converter.render(f),f.converter.render({...f,outputPath:second})]);assert.match((await readFile(second)).subarray(0,8).toString(),/^%PDF-/);await empty(f);}finally{await f.converter.dispose();}
});
test('bad binary Office header is rejected before launch',async()=>{
  const f=await fixture(),inputPath=join(f.root,'bad.doc');await writeFile(inputPath,'bad');try{await assert.rejects(f.converter.render({...f,inputPath}),e=>e.code==='invalid-document');await empty(f);}finally{await f.converter.dispose();}
});
test('unsupported suffix is rejected without creating work files',async()=>{
  const f=await fixture();try{await assert.rejects(f.converter.render({...f,inputPath:join(f.root,'bad.exe')}),e=>e.code==='unsupported-format');await empty(f);}finally{await f.converter.dispose();}
});
test('long managed profile is converted through an identity-matched short alias',async()=>{
  const f=await fixture();await f.converter.dispose();const workRoot=join(f.root,'long-profile-parent-'+('abcdefghij'.repeat(8)));await mkdir(workRoot);const c=await createConverter({executablePath,workRoot,timeoutMs:30000});
  try{await c.render(f);assert.match((await readFile(f.outputPath)).subarray(0,8).toString(),/^%PDF-/);assert.deepEqual(await readdir(workRoot),[]);}finally{await c.dispose();}
});
test('profile paths without a sufficiently short alias fail clearly before engine work',async()=>{
  const f=await fixture();await f.converter.dispose();const workRoot=join(f.root,...Array.from({length:12},(_,i)=>'a'+String(i).padStart(6,'0')));await mkdir(workRoot,{recursive:true});const c=await createConverter({executablePath,workRoot,timeoutMs:30000});
  try{await assert.rejects(c.render(f),e=>e.code==='unavailable'&&/PROFILE_PATH_TOO_LONG/.test(e.diagnostics?.stderr));await absent(f.outputPath);assert.deepEqual(await readdir(workRoot),[]);}finally{await c.dispose();}
});
test('the conservative 128-character canonical profile boundary converts normally',async()=>{
  const f=await fixture();await f.converter.dispose();
  // 98 + separator + 21-character owned-job basename + separator + profile = 128.
  const workRoot=join(f.root,'p'.repeat(98-f.root.length-1));assert.equal(workRoot.length,98);await mkdir(workRoot);const c=await createConverter({executablePath,workRoot,timeoutMs:30000});
  try{await c.render(f);assert.match((await readFile(f.outputPath)).subarray(0,8).toString(),/^%PDF-/);assert.deepEqual(await readdir(workRoot),[]);}finally{await c.dispose();}
});
