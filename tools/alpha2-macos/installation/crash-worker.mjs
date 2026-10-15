import{readFile}from'node:fs/promises';import{executeFirstInstall}from'./first-install.mjs';
const input=JSON.parse(await readFile(process.argv[2],'utf8')),phase=process.argv[3];
try{const receipt=await executeFirstInstall({...input,onProgress:async event=>{if(event.phase===phase){process.send?.({kind:'pause',phase});await new Promise(()=>{});}}});process.send?.({kind:'done',receipt});process.disconnect?.();}
catch(error){process.send?.({kind:'error',code:error.code??error.message});process.disconnect?.();process.exitCode=1;}
