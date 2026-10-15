#!/usr/bin/env node
import {readFile,lstat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {openManagedService} from '../src/managed.mjs';
import {recoveryClient} from '../src/client.mjs';
const [command,path,method,input]=process.argv.slice(2);
async function json(file){if(!isAbsolute(file)||!(await lstat(file)).isFile()||(await lstat(file)).size>65536)throw Error('RECOVERY_FILE_INVALID');return JSON.parse(await readFile(file,'utf8'));}
try{
 if(command==='serve'){
  const config=await json(path);if(!isAbsolute(config.controlRoot))throw Error('RECOVERY_CONFIG_INVALID');
  const service=await openManagedService(config);console.log(JSON.stringify({status:'ready',url:service.connection.endpoint,connectionFile:service.connectionFile,scope:'Use open-url for local capability URL; no workspace auto-created'}));
  let closing;const close=()=>closing??=(async()=>{await service.close();process.exitCode=0;})();process.once('SIGINT',close);process.once('SIGTERM',close);process.on('message',m=>{if(m?.type==='dsh-daily-shutdown')void close();});
 }else if(command==='open-url'){
  const connection=await json(path);recoveryClient(connection);console.log(`${connection.endpoint}#${connection.token}`);
 }else if(command==='call'){
  const lengthy=new Set(['createBackup','planRestore','restoreBackup','deleteBackup','deleteBackupArtifact','startHost','stopHost','createContinuation']);
  const client=recoveryClient({...await json(path),timeoutMs:lengthy.has(method)?300000:5000});const params=input?await json(input):{};console.log(JSON.stringify(await client.call(method,params),null,2));
 }else throw Error('Usage: recovery serve <config.json> | open-url <connection.json> | call <connection.json> <method> [params.json]');
}catch(error){const code=error.code??error.message;const uncertain=command==='call'&&['RECOVERY_TIMEOUT','ECONNRESET','EPIPE'].includes(code);console.error(JSON.stringify({status:uncertain?'blocked':'fail',code,...uncertain?{execution:'unknown',next:'Check status, backup catalog, and failed artifacts before retry. Timeout does not cancel the operation.'}:{}}));process.exitCode=1;}
