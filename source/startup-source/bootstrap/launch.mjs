import {safeHostCode} from './@MANAGED_DIR@/startup-diagnostic.mjs';
import {run} from './@MANAGED_DIR@/launcher.mjs';
import {join} from 'node:path';
import {open,rename,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
run(join(import.meta.dirname,'@CONFIG_FILE@')).catch(async error=>{
 const code=/^[A-Z0-9_]{1,80}$/.test(error.code??'')?error.code:'DAILY_START_FAILED';
 const host=safeHostCode(error.hostCode),detail=code+(host?' ('+host+')':'');
 console.error('DSH SEP startup failed: '+detail);
 try{const state=join(import.meta.dirname,'state');if((await realpath(state)).toLowerCase()!==state.toLowerCase())throw Error('state changed');
  const file=join(state,'startup-error.txt'),temp=file+'.'+randomUUID()+'.tmp';const f=await open(temp,'wx',0o600);
  try{await f.writeFile('DSH SEP startup failed: '+detail+'\r\nTime: '+new Date().toISOString()+'\r\n');await f.sync();}finally{await f.close();}await rename(temp,file);
 }catch{console.error('Startup diagnostic could not be saved.');}process.exitCode=1;
});
