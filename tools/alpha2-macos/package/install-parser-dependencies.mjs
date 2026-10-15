// CI/build only. Pinned existing parser closure; never runs package scripts.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {runOwnedCommand} from '../desktop/run-command.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const out=resolve(process.argv[2]),temp=await realpath(process.env.RUNNER_TEMP);
assert(out.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const lock=JSON.parse(await readFile(new URL('./parser-dependencies.json',import.meta.url),'utf8'));
assert.equal(lock.schema,1);assert.equal(lock.packages.length,12);const receipts=[];
async function command(label,args){const logPath=join(out,label+'.log'),r=await runOwnedCommand({file:'/usr/bin/tar',args,cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin'},logPath,timeoutMs:120000});assert.equal(r.status,'pass',label);return readFile(logPath,'utf8');}
try{
 for(const p of lock.packages){
  assert(/^(@[a-z0-9-]+\/)?[a-z0-9.-]+$/.test(p.name)&&/^\d+\.\d+\.\d+$/.test(p.version));assert(/^sha512-[A-Za-z0-9+/]+=*$/.test(p.integrity));
  const base=p.name.split('/').at(-1),url='https://registry.npmjs.org/'+p.name+'/-/'+base+'-'+p.version+'.tgz';
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});assert(response.ok);
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.byteLength;assert(size<=67108864);chunks.push(chunk);}
  const bytes=Buffer.concat(chunks),actual='sha512-'+createHash('sha512').update(bytes).digest('base64');assert.equal(actual,p.integrity);
  const archive=join(out,base+'-'+p.version+'.tgz'),destination=join(out,'node_modules',p.name);await writeFile(archive,bytes,{flag:'wx',mode:0o600});await mkdir(destination,{recursive:true,mode:0o700});
  const listed=await command(base+'-list',['-tzf',archive]);for(const path of listed.trim().split(/\r?\n/))assert(path==='package'||path==='package/'||(path.startsWith('package/')&&!path.slice(8).split('/').some(x=>x==='.'||x==='..')&&!/[\\\x00-\x1f\x7f]/.test(path)));
  const types=await command(base+'-types',['-tvzf',archive]);for(const row of types.trim().split(/\r?\n/))assert(/^[d-]/.test(row),'PARSER_ARCHIVE_ENTRY_TYPE');
  await command(base+'-extract',['-xzf',archive,'--strip-components=1','-C',destination]);
  const manifest=JSON.parse(await readFile(join(destination,'package.json'),'utf8'));assert.equal(manifest.name,p.name);assert.equal(manifest.version,p.version);
  for(const name of Object.keys(manifest.dependencies??{}))assert(lock.packages.some(x=>x.name===name),'PARSER_DEPENDENCY_CLOSURE:'+name);
  receipts.push({name:p.name,version:p.version,integrity:actual,bytes:size,status:'pass'});
 }
 await writeFile(join(out,'RESULT.json'),JSON.stringify({schema:1,status:'pass',scope:'exact existing SEP parser dependency versions; darwin-arm64; no lifecycle scripts',sourceLockSha256:lock.sourceSha256,packages:receipts},null,2)+'\n',{flag:'wx'});
}catch(e){await writeFile(join(out,'RESULT.json'),JSON.stringify({schema:1,status:'fail',errorType:e.name,packages:receipts},null,2)+'\n',{flag:'wx'});throw e;}
