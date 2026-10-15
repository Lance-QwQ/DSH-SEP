import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {setTimeout as delay} from 'node:timers/promises';
const [installation,root]=process.argv.slice(2),program=join(installation,'program'),data=join(installation,'data');process.umask(0o077);await mkdir(root,{mode:0o700});
const original=await readFile(join(data,'home/profiles/desktop/cordis.patch.yml')),rows=[];
try{for(const round of [1,2]){
 const gate=join(root,'round-'+round);await mkdir(gate,{mode:0o700});const patch=JSON.parse(original);patch.push({insert:[{id:'inspection-fixture',name:new URL('./active-inspection-fixture.mjs',import.meta.url).href,config:{root:gate,source:join(data,'project'),round}}]});await writeFile(join(data,'home/profiles/desktop/cordis.patch.yml'),JSON.stringify(patch));
 const child=spawn(join(program,'start.sh'),[data,'--headless'],{env:process.env,stdio:['ignore','pipe','pipe']}),out=[],err=[],row={round};rows.push(row);child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));let exit;const ended=new Promise(r=>child.once('close',(code,signal)=>{exit={code,signal};r(exit);}));
 async function until(fn,ms){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;if(exit)throw Error('LAUNCH_EXIT');await delay(100);}throw Error('INSPECTION_TEST_DEADLINE');}
 try{
  await until(()=>Buffer.concat(out).toString().includes('"phase":"ready"'),90000);
  const conn=JSON.parse(await readFile(join(data,'desktop-connection.json'))),rpc=async()=>{const response=await fetch(conn.endpoint+'rpc',{method:'POST',headers:{authorization:'Bearer '+conn.token,'content-type':'application/json'},body:JSON.stringify({method:'desktopQuitInspection'}),signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);return (await response.json()).result;};
  row.before=await rpc();assert.deepEqual(row.before,{activeTasks:false,scheduledTasks:false});await writeFile(join(gate,'begin'),'1');await until(async()=>{try{await readFile(join(gate,'entered.json'));return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}},20000);
  row.running=await rpc();assert.equal(row.running.activeTasks,true);await writeFile(join(gate,'release'),'1');await until(async()=>{try{return JSON.parse(await readFile(join(gate,'idle.json'))).status==='idle';}catch(e){if(e.code!=='ENOENT')throw e;return false;}},20000);row.after=await rpc();assert.deepEqual(row.after,{activeTasks:false,scheduledTasks:false});
  child.kill('SIGTERM');await Promise.race([ended,delay(35000).then(()=>{throw Error('INSPECTION_SHUTDOWN_DEADLINE');})]);assert.equal(exit.code,0);row.status='pass';row.exit=exit;
 }catch(e){row.status='fail';row.code=e.message;process.exitCode=1;}
 finally{if(!exit){child.kill('SIGTERM');await Promise.race([ended,delay(35000)]);}await writeFile(join(gate,'stdout.log'),Buffer.concat(out));await writeFile(join(gate,'stderr.log'),Buffer.concat(err));}
 if(row.status!=='pass')break;
}}finally{await writeFile(join(data,'home/profiles/desktop/cordis.patch.yml'),original);}
const result={status:rows.length===2&&rows.every(r=>r.status==='pass')?'pass':'fail',scope:'installed production Host/RPC and real Agent; test-only synthetic LLM waterfall and profile plugin, no paid network calls; scheduled task positive and renderer quit dialog not covered',rows};await writeFile(join(root,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
