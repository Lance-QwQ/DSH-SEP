import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const [suiteRoot,storageRoot,lockDirectory,mode]=process.argv.slice(2);
if(mode==='legacy'){
 const root=join(storageRoot,'.suite-memory/p2'),head=JSON.parse(await readFile(join(root,'head.json'),'utf8'));
 await writeFile(join(root,'owner.lock'),JSON.stringify({pid:process.pid,createdAt:new Date().toISOString(),identity:head.identity,token:randomUUID(),mode:'writer'}),{flag:'wx'});
 await writeFile(join(lockDirectory,'dsh-system-enhancement-package-v1.lock'),JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}),{flag:'wx'});
 process.exit(1);
}
const {openControl}=await import(pathToFileURL(join(suiteRoot,'src/p2/control.js')));
const {acquireOwnerFile}=await import('../ownership/owner-file.mjs');
const control=mode==='suite-only'?null:await openControl({storageRoot});
let suite;
if(!['p2-only','ready-no-suite'].includes(mode))suite=await acquireOwnerFile({path:join(lockDirectory,'dsh-system-enhancement-package-v1.lock'),payload:{pid:process.pid,createdAt:new Date().toISOString()},validatePrior:p=>Number.isInteger(p.pid)&&p.pid>0&&Number.isFinite(Date.parse(p.createdAt))});
if(mode==='p2-only'||mode==='before-ready'||mode==='suite-only'){process.exit(1);}
const keep=setInterval(()=>{},1000);
let closing;
const close=()=>closing??=(async()=>{clearInterval(keep);await suite?.release();await control?.close();if(process.connected)process.disconnect();})();
process.on('message',m=>{if(m?.type==='dsh-daily-shutdown')void close();});
process.once('disconnect',()=>{void close();});
process.send({type:'dsh-guardian-ready'});
