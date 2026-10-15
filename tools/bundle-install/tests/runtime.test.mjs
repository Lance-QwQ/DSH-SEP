import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

const root=await realpath(resolve(process.env.SEP_BUNDLE_REPO));
const require=createRequire(join(root,'package.json'));
const load=specifier=>import(pathToFileURL(require.resolve(specifier)));
const moduleFile=path=>join(root,'bundle/modules',path);

async function workerResult(path,data) {
  const worker=new Worker(pathToFileURL(moduleFile(path)),{workerData:data,stdout:true,stderr:true});
  let packet,diagnostics='';
  worker.stdout.on('data',chunk=>{ diagnostics+=chunk.toString(); });
  worker.stderr.on('data',chunk=>{ diagnostics+=chunk.toString(); });
  try {
    return await new Promise((yes,no)=>{
      const timer=setTimeout(()=>{worker.terminate();no(Error('SYNTHETIC_WORKER_TIMEOUT'));},12000);
      worker.once('error',error=>{clearTimeout(timer);no(error);});
      worker.once('message',value=>{packet=value;});
      worker.once('exit',code=>{clearTimeout(timer);code===0&&packet!==undefined?yes(packet):no(Error(`Worker exited ${code}: ${diagnostics}`));});
    });
  } finally { await worker.terminate(); }
}

test('recovery composition loads the bundled core rather than an unpublished npm sibling', async () => {
  const composition=await import(pathToFileURL(moduleFile('recovery/src/suite-plugin.mjs')));
  let observed;
  await composition.apply({plugin:async (module,config)=>{observed={module,config};}}, {enabled:false});
  assert.equal(observed.module.name,'dsh-system-enhancement-package');
  assert.equal(observed.module.validateSuiteConfig({enabled:false}).enabled,false);
  assert.equal(observed.config.enabled,false);
});

test('DOCX Worker resolves the clean-installed archive and XML libraries', async () => {
  const {zipSync,strToU8}=await load('fflate');
  const bytes=zipSync({'word/document.xml':strToU8('<w:document><w:body><w:p><w:r><w:t>synthetic document</w:t></w:r></w:p></w:body></w:document>')});
  const result=await workerResult('system-enhancement-package/src/parser-worker.js',{kind:'document',bytes,options:{extension:'.docx',maxChars:2000}});
  assert.equal(result.error,undefined);
  assert.equal(result.value.parts[0].text,'synthetic document');
});

test('image Worker loads the clean-installed Windows native decoder', async () => {
  const {createCanvas}=await load('@napi-rs/canvas');
  const canvas=createCanvas(2,3);
  const result=await workerResult('system-enhancement-package/src/parser-worker.js',{kind:'image',bytes:canvas.toBuffer('image/png'),options:{}});
  assert.equal(result.error,undefined);
  assert.equal(result.value.width,2);
  assert.equal(result.value.height,3);
});

function samplePdf() {
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream='BT /F1 12 Tf 10 100 Td (synthetic pdf) Tj ET';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let result='%PDF-1.4\n'; const offsets=[0];
  for(const [index,body] of objects.entries()){offsets.push(Buffer.byteLength(result));result+=`${index+1} 0 obj\n${body}\nendobj\n`;}
  const xref=Buffer.byteLength(result);
  result+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}

test('PDF Worker finds PDF.js companion assets in a clean installation', async () => {
  const result=await workerResult('system-enhancement-package/src/parser-worker.js',{kind:'document',bytes:samplePdf(),options:{extension:'.pdf',maxChars:2000}});
  assert.equal(result.error,undefined);
  assert.match(result.value.parts[0].text,/synthetic pdf/);
});

test('lossless-claw selected SQLite modules run with their packaged Worker and remain transient', async () => {
  const records=[JSON.stringify({role:'user',content:[{type:'text',text:'synthetic input'}]})];
  const result=await workerResult('plugin-group/source/lossless-integrity-worker.mjs',{projectId:'synthetic-project',records,summary:'synthetic summary'});
  assert.equal(result.ok,true);
  assert.equal(result.receipt.messageCount,1);
  assert.equal(result.receipt.persisted,false);
});

test('Mem0 adapted fact schema resolves its third-party library without cloud access', async () => {
  const {FactRetrievalSchema}=await import(pathToFileURL(moduleFile('plugin-group/vendor/mem0/index.js')));
  assert.deepEqual(FactRetrievalSchema.parse({facts:['synthetic project fact']}),{facts:['synthetic project fact']});
});

test('upstream expansion helper imports TypeBox from the bundle dependency set', async () => {
  await assert.doesNotReject(import(pathToFileURL(moduleFile('plugin-group/vendor/lossless-claw/expansion.js'))));
});

test('trusted evaluation plugin can be imported with no backend start', async () => {
  const entry=await import(pathToFileURL(moduleFile('trusted-evaluation-entry/index.mjs')));
  assert.equal(entry.name,'dsh-sep-trusted-evaluation-entry');
  assert.equal(typeof entry.apply,'function');
});
