import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadProgram,validateProgramShape} from './program-manifest.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const appRoot='Helpers/DSH SEP Desktop.app';
function program(){
 const entries={node:appRoot+'/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node',electron:appRoot+'/Contents/MacOS/DSH SEP',asar:appRoot+'/Contents/Resources/app.asar',business:'Resources/product/runtime/document-business/standalone.mjs',ownerLease:'Resources/product/runtime/captured/owner-lease.mjs',helper:'Resources/product/payload/native/project-tree',attachmentHelper:'Resources/product/payload/native/attachment-tree',parserManifest:'Resources/product/payload/parser-runtime/manifest.json'};
 return {schema:4,layout:'macos-app-v1',validationScope:'isolated-macos-preview',dshVersion:'0.2.1-alpha.2',appRoot,hostRoot:'Resources/product/payload/host',bundleRoot:'Resources/product/payload/host/sep-capture',parserRoot:'Resources/product/payload/parser-runtime',capabilities:['governed-images','trusted-parsers'],entries:Object.fromEntries(Object.entries(entries).map(([key,path])=>[key,{path,sha256:'a'.repeat(64)}]))};
}
async function fixture(){
 assert(process.env.SEP_DESKTOP_TEST_ROOT,'explicit isolated output root required');
 const base=await mkdtemp(join(resolve(process.env.SEP_DESKTOP_TEST_ROOT),'app-program-')),root=join(base,'DSH SEP.app','Contents'),p=program();
 for(const dir of [p.appRoot,p.hostRoot,p.bundleRoot,p.parserRoot])await mkdir(join(root,dir),{recursive:true});
 for(const [key,entry]of Object.entries(p.entries)){const body=Buffer.from('synthetic '+key);await mkdir(dirname(join(root,entry.path)),{recursive:true});await writeFile(join(root,entry.path),body);entry.sha256=digest(body);}
 const path=join(root,'Resources','PROGRAM.json'),bytes=JSON.stringify(p);await writeFile(path,bytes);return{base,root,p,path,sha:digest(bytes)};
}
test('schema4 describes one fixed application layout without parent paths',()=>{assert.equal(validateProgramShape(program()).layout,'macos-app-v1');});
test('schema4 rejects alternate layouts, misplaced executable roles and prior-schema relabeling',()=>{
 for(const change of [p=>delete p.layout,p=>p.layout='other',p=>p.schema=3,p=>p.appRoot='Resources/arbitrary.app',p=>p.hostRoot='Helpers/host',p=>p.entries.business.path='Helpers/untrusted.mjs',p=>p.entries.node.path='Resources/product/node',p=>p.entries.electron.path=appRoot+'/Contents/MacOS/Other',p=>p.entries.asar.path=appRoot+'/Contents/Resources/other.asar']){const p=program();change(p);assert.throws(()=>validateProgramShape(p));}
});
test('fixed Resources manifest resolves verified entries from Contents',async()=>{const f=await fixture(),p=await loadProgram(f.path,f.sha);assert.equal(p.root,f.root);assert.equal(p.parserRoot,join(f.root,f.p.parserRoot));assert.equal(p.entries.node.path,join(f.root,f.p.entries.node.path));});
test('same schema4 bytes outside the fixed application manifest position refuse',async()=>{const f=await fixture();for(const path of [join(f.root,'PROGRAM.json'),join(f.root,'Resources','OTHER.json'),join(f.base,'Resources','PROGRAM.json')]){await mkdir(dirname(path),{recursive:true});await copyFile(f.path,path);await assert.rejects(loadProgram(path,f.sha),{code:'SEP_MAC_PROGRAM_LAYOUT'});}});
test('fixed app layout still refuses replaced program and entry bytes',async()=>{const f=await fixture();await writeFile(join(f.root,f.p.entries.electron.path),'changed');await assert.rejects(loadProgram(f.path,f.sha),{code:'SEP_MAC_PROGRAM_CHANGED'});await assert.rejects(loadProgram(f.path,'0'.repeat(64)),{code:'SEP_MAC_PROGRAM_CHANGED'});});
