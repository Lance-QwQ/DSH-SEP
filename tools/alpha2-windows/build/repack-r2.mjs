// Create-only installer repair. The sealed program and original distribution
// remain unchanged; every inherited source byte is checked against its manifest.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {stableBytes} from './program-files.mjs';
const P='D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1',out=join(P,'repaired-r2'),source=resolve(import.meta.dirname,'..');
const sha=b=>createHash('sha256').update(b).digest('hex'),json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const archives=JSON.parse(await readFile(join(P,'ARCHIVES.json'))),freeze=JSON.parse(await readFile(join(P,'installer-freeze-r2/FREEZE.json')));
assert.equal(archives.status,'pass');assert.equal(freeze.status,'pass');
const replacement=new Map();
for(const name of ['install.mjs','fresh-profile.mjs','daily-profile.mjs','DAILY-PROFILE-ORIGIN.json']){
 const bytes=await readFile(join(source,'installer',name));
 const expected=freeze.files.find(x=>x.path===name||x.path==='installer/'+name);assert(expected,'MISSING_INSTALLER_FREEZE');assert.equal(sha(bytes),expected.sha256);replacement.set('installer/'+name,bytes);
}
replacement.set('README.md',await readFile(join(source,'README-PACKAGE.md')));
await mkdir(out);const results=[];
for(const kind of ['full','sep']){
 const base=join(P,'bundle-'+kind),target=join(out,'bundle-'+kind),manifestBytes=await readFile(join(base,'manifest.json')),m=JSON.parse(manifestBytes);
 assert.equal(sha(manifestBytes),{full:'45bf0166ccb5c4e818959c03aa0701b4d8423461a99ae5ebab7336f45980b3b4',sep:'380ea581392f2748b6581c320349e93be308757de50fa7367e7beb9b15dde812'}[kind]);
 assert.equal(m.revision,'windows-package.1');assert.equal(m.kind,kind);
 await mkdir(target);const next=structuredClone(m);next.revision='windows-package.2';
 const changes=[];
 async function put(path,bytes){await mkdir(dirname(join(target,path)),{recursive:true});await writeFile(join(target,path),bytes,{flag:'wx'});}
 for(const row of m.payload)await put('payload/'+row.path,await stableBytes(join(base,'payload',row.path),{...row,mode:420}));
 for(const row of [m.graph,m.descriptor])await put(row.path,await stableBytes(join(base,row.path),{...row,mode:420}));
 next.support=[];
 for(const row of m.support){
  const prior=await stableBytes(join(base,row.path),{...row,mode:420});let bytes=replacement.get(row.path)??prior;
  if(row.path==='docs/BUILD-PROVENANCE.json'){const data=JSON.parse(prior);data.revision=next.revision;data.installerRepair='docs/PACKAGING-REPAIR.json';bytes=json(data);}
  const updated={...row,size:bytes.length,sha256:sha(bytes)};next.support.push(updated);await put(row.path,bytes);
  if(updated.sha256!==row.sha256)changes.push({path:row.path,beforeSha256:row.sha256,afterSha256:updated.sha256});
 }
 const repair=json({schema:1,revision:next.revision,scope:'Fresh-installation configuration only; no existing ledger migration or amount reset.',reason:'The old ledger parent state overlapped the lock root state/locks, causing SEP_BINDING_SCOPE_CONFLICT at startup.',budgetPath:'state/budget/budget.json',previousArchive:archives.archives.find(x=>x.kind===kind).sha256,previousManifestSha256:sha(manifestBytes),programGraphUnchanged:m.graph.sha256,descriptorUnchanged:m.descriptor.sha256,changes});
 await put('docs/PACKAGING-REPAIR.json',repair);next.support.push({path:'docs/PACKAGING-REPAIR.json',size:repair.length,sha256:sha(repair),mode:420});
 const bytes=json(next);await put('manifest.json',bytes);results.push({kind,root:target,manifestSha256:sha(bytes),payloadFiles:next.payload.length,requiredFiles:next.required.length,supportFiles:next.support.length,changes});console.log(JSON.stringify(results.at(-1)));
}
await writeFile(join(out,'ASSEMBLED.json'),json({schema:1,status:'pass',revision:'windows-package.2',bundles:results}),{flag:'wx'});
