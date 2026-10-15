import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,readlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base=process.argv[2],operator=process.argv[3];
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFile(join(base,p));
function count(text){const r={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){const m=text.match(new RegExp('^# '+key+' (\\d+)$','m'));assert(m,key);r[key]=Number(m[1]);}return r;}
const logs={};for(const name of ['core-r1.tap','probes-r1.tap','combined-r2.tap','combined-r3.tap','isolation-red-r1.tap','isolation-green-r1.tap','isolation-hardlink-red.tap','isolation-green-r2.tap','isolation-green-r3.tap','isolation-green-r4.tap']){
 const bytes=await read(name);logs[name]={sha256:sha(bytes),counts:count(bytes.toString())};
}
assert.deepEqual(logs['core-r1.tap'].counts,{tests:40,pass:39,fail:1,cancelled:0,skipped:0,todo:0});
assert.equal(logs['probes-r1.tap'].counts.pass,7);
for(const name of ['core-r1.tap','combined-r2.tap','combined-r3.tap']){
 const text=(await read(name)).toString();const failed=[...text.matchAll(/^not ok \d+ - (.+)$/gm)].map(x=>x[1]);
 assert.deepEqual(failed,['native binding coexists with actual protected Profile and preserves durable Session, lease and ledger']);assert.match(text,/code: 'FS_PROTECTION_UNAVAILABLE'/);
}
for(const round of [2,3,4])assert.deepEqual(logs['isolation-green-r'+round+'.tap'].counts,{tests:7,pass:7,fail:0,cancelled:0,skipped:0,todo:0});
const install=await read('install-r1.log');assert.match(install.toString(),/Lockfile passes supply-chain policies \(815 entries/);assert.match(install.toString(),/Done in .* using pnpm v11.7.0/);
const deb=await read('sandbox-downloads/bubblewrap_0.9.0-1ubuntu0.3_amd64.deb'),meta=(await read('sandbox-downloads/metadata.txt')).toString();
assert.match(meta,new RegExp('SHA256: '+sha(deb)));
const executable=await read('sandbox-runtime/usr/bin/bwrap');assert.equal(sha(executable),'e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71');
const operatorFiles={};for(const name of (await readdir(operator)).sort())operatorFiles[name]=sha(await readFile(join(operator,name)));
// This checks only generation-related process command lines. It is not a
// whole-system handle or memory-leak audit. Deadline tests prove their own child cleanup.
const leftovers=[];for(const pid of (await readdir('/proc')).filter(x=>/^\d+$/.test(x)&&Number(x)!==process.pid)){
 try{const text=(await readFile('/proc/'+pid+'/cmdline','utf8')).replaceAll('\0',' ');if((text.startsWith('/opt/dsh-sep-cross-platform/runtime/bin/node ')||text.startsWith('/proc/self/fd/5 '))&&(text.includes(base)||text.includes('alpha2-portable-tools-')))leftovers.push(Number(pid));}catch{}
}
assert.deepEqual(leftovers,[]);
const prepared=JSON.parse(await read('PREPARED.json'));
const result={schema:1,status:'pass',scope:'Linux Alpha.2 foundation and standalone strong-isolation proof only; not protected Profile or desktop certification',source:prepared,environment:{platform:process.platform,arch:process.arch,node:process.version,nodePath:process.execPath,pnpm:'11.7.0',kernel:execFileSync('/usr/bin/uname',['-r'],{encoding:'utf8'}).trim(),filesystem:'ext4 in D-backed WSL VHD',desktop:'WSLg detected; Electron not tested in this phase'},install:{status:'pass',frozen:true,ignoreScripts:true,minimumReleaseAge:1440,directDependencies:prepared.directDependencies,supplyChainEntries:815,sha256:sha(install)},core:{status:'blocked',definitions:47,rounds:3,passEach:46,failEach:1,knownFailure:'FS_PROTECTION_UNAVAILABLE at the Windows-only recovery authority; unchanged and intentionally not bypassed'},strongIsolation:{status:'pass',userDecision:'Use stronger isolation; verify before enabling writes',implementation:'Standalone Bubblewrap carrier; never publishes into the real source',definitions:7,finalRounds:3,passEach:7,bubblewrap:{version:'0.9.0-1ubuntu0.3',debSha256:sha(deb),binarySha256:sha(executable),source:'Ubuntu noble-updates apt package; metadata SHA256 checked'},fix:'Fresh empty private work directory required; prevents preexisting hard-link alias from bypassing a read-only source mount',testScope:['read-only source and writable private work','unlink, rename, hard-link and symlink attack refusal','hidden host home, credentials and program roots','isolated network, empty capabilities and no_new_privs','nested user namespace and remount refusal','deadline child cleanup and output cap','binary fingerprint mismatch rejection']},logs,operatorFiles,resourceAudit:{status:'pass',matchingProcessIds:leftovers,scope:'generation-related Node and sandbox command lines only; each test also waits for its exact children'},notVerified:['Full Linux protected Profile activation','Working-copy import, publication journal and recovery transactions','Shell/MCP/subagent sandbox integration','Linux Electron lifecycle and packaging','Native dependencies requiring build/install scripts','macOS execution, complete protected Profile and desktop','Same-run public updater positive'],dailyChanged:false,githubPublished:false};
await writeFile(join(base,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,core:result.core,isolation:result.strongIsolation.status,resourceAudit:result.resourceAudit.status}));
