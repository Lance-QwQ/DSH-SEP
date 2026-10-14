import {readFile} from 'node:fs/promises';
import {openTestInstallerController} from './testing.mjs';
const input=JSON.parse(await readFile(process.argv[2],'utf8')),phase=process.argv[3];
try{
  const app=await openTestInstallerController({...input.config,onProgress:async event=>{
    if(event.phase===phase){process.send?.({kind:'pause',phase,transactionId:event.transactionId});await new Promise(()=>{});}
  }});
  const preview=await app.preview();process.send?.({kind:'preview',preview});
  const result=await app.confirm({planHash:preview.planHash});await app.close();
  process.send?.({kind:'done',result});process.disconnect?.();
}catch(error){process.send?.({kind:'error',code:error.code??error.message});process.disconnect?.();process.exitCode=1;}
