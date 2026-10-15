import {mkdir,writeFile,readFile,lstat} from 'node:fs/promises';
import {join,dirname,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {safePath,listRegularFiles} from './bundle-audit.mjs';
export async function exerciseInstallerRefusals({bundle,meta,hostRoot,output}){
 const rel=relative('D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1',output);assert(rel&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\'));await mkdir(output);
 const{install}=await import(pathToFileURL(join(bundle,'installer.mjs'))),checks=[];
 const existing=join(output,'existing-target');await mkdir(existing);await writeFile(join(existing,'sentinel.txt'),'synthetic unchanged sentinel\n',{flag:'wx'});
 await assert.rejects(install({bundle,destination:existing,...meta.kind==='sep'?{hostRoot}:{}}),{code:'RELEASE_DESTINATION_EXISTS'});
 assert.equal(await readFile(join(existing,'sentinel.txt'),'utf8'),'synthetic unchanged sentinel\n');assert.deepEqual(await listRegularFiles(existing),['sentinel.txt']);
 checks.push({name:meta.kind+'-real-archive-installer-refuses-existing-target',status:'pass',code:'RELEASE_DESTINATION_EXISTS',sentinelUnchanged:true});
 if(meta.kind==='sep'){
  assert(meta.manifest.required.length>0);const first=meta.manifest.required[0];safePath(first.sourcePath);
  const donor=join(output,'one-file-donor'),destination=join(output,'tamper-target'),file=join(donor,first.sourcePath);await mkdir(dirname(file),{recursive:true});
  // Only the first required row is present. The installer checks it before all
  // later donor rows; the expected refusal is content mismatch, never ENOENT.
  const body=Buffer.from('synthetic invalid donor bytes\n');await writeFile(file,body,{flag:'wx'});
  await assert.rejects(install({bundle,destination,hostRoot:donor}),{code:'RELEASE_FILE_CHANGED'});
  await assert.rejects(lstat(destination),{code:'ENOENT'});assert.deepEqual(await readFile(file),body);assert.deepEqual(await listRegularFiles(donor),[first.sourcePath]);
  checks.push({name:'sep-real-archive-installer-refuses-first-required-donor-tamper',status:'pass',code:'RELEASE_FILE_CHANGED',fixtureFiles:1,targetCreated:false,officialSourceTouched:false,firstRequiredPath:first.sourcePath});
 }
 const result={schema:1,status:'pass',scope:'Actual extracted installer, existing output and one-file synthetic incorrect donor. Original official donor is only passed read-only to the existing-target refusal.',checks};await writeFile(join(output,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
