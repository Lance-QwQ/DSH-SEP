import nativeTest from 'node:test';import assert from 'node:assert/strict';
// Windows reports writable fixtures as mode 0666 even when opened with 0600.
// Its result cannot establish the POSIX permission/identity admission contract.
const test=(name,fn)=>nativeTest(name,{skip:process.platform==='win32'?'POSIX file permission semantics required':false},fn);
import {mkdtemp,mkdir,writeFile,link} from 'node:fs/promises';import {join,dirname,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {buildBootstrapManifest} from './bootstrap-manifest-builder.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(){
 assert(process.env.SEP_DESKTOP_TEST_ROOT);const outer=await mkdtemp(join(resolve(process.env.SEP_DESKTOP_TEST_ROOT),'bootstrap-builder-')),root=join(outer,'DSH SEP.app/Contents'),appRoot='Helpers/DSH SEP Desktop.app';
 const files={node:appRoot+'/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node',electron:appRoot+'/Contents/MacOS/DSH SEP',asar:appRoot+'/Contents/Resources/app.asar',business:'Resources/product/runtime/document-business/standalone.mjs',ownerLease:'Resources/product/runtime/captured/owner-lease.mjs',helper:'Resources/product/payload/native/project-tree',attachmentHelper:'Resources/product/payload/native/attachment-tree',parserManifest:'Resources/product/payload/parser-runtime/manifest.json'};
 const p={schema:4,layout:'macos-app-v1',validationScope:'isolated-macos-preview',dshVersion:'0.2.1-alpha.2',appRoot,hostRoot:'Resources/product/payload/host',bundleRoot:'Resources/product/payload/host/sep-capture',parserRoot:'Resources/product/payload/parser-runtime',capabilities:['governed-images','trusted-parsers'],entries:{}};
 for(const d of [p.hostRoot,p.bundleRoot,p.parserRoot])await mkdir(join(root,d),{recursive:true,mode:0o700});
 for(const[k,path]of Object.entries(files)){const b=Buffer.from('identity-only '+k);await mkdir(dirname(join(root,path)),{recursive:true,mode:0o700});await writeFile(join(root,path),b,{mode:0o600});p.entries[k]={path,sha256:sha(b)};}
 const controller=join(root,'Resources/product/runtime/bootstrap/controller.mjs');await mkdir(dirname(controller),{recursive:true,mode:0o700});await writeFile(controller,'// identity fixture; never executed\n',{mode:0o600});await writeFile(join(root,'Resources/PROGRAM.json'),JSON.stringify(p),{mode:0o600});return{root,outer,p,controller};
}
test('bootstrap manifest binds final program, Node and all runtime files without executing them',async()=>{const f=await fixture(),m=await buildBootstrapManifest(f.root);assert.equal(m.closure.length,3);assert.equal(m.controller.path,'Resources/product/runtime/bootstrap/controller.mjs');assert.equal(m.node.sha256,f.p.entries.node.sha256);assert(m.closure.every(e=>/^[a-f0-9]{64}$/.test(e.sha256)));});
test('test code mixed into final runtime refuses before bootstrap compilation',async()=>{const f=await fixture();await writeFile(join(f.root,'Resources/product/runtime/secret.test.mjs'),'// fixture\n');await assert.rejects(buildBootstrapManifest(f.root),{code:'SEP_BOOTSTRAP_MANIFEST'});});
test('runtime hard links cannot enter the final bootstrap manifest',async()=>{const f=await fixture();await link(f.controller,join(f.outer,'alias.mjs'));await assert.rejects(buildBootstrapManifest(f.root),{code:'SEP_MAC_BOOTSTRAP_INPUT'});});
test('changed program-bound executable bytes refuse before bootstrap compilation',async()=>{const f=await fixture();await writeFile(join(f.root,f.p.entries.node.path),'replaced');await assert.rejects(buildBootstrapManifest(f.root),{code:'SEP_MAC_PROGRAM_CHANGED'});});
test('arbitrary parent roots are refused',async()=>{const f=await fixture();await assert.rejects(buildBootstrapManifest(join(f.root,'Resources')),{code:'SEP_MAC_BOOTSTRAP_ROOT'});});
