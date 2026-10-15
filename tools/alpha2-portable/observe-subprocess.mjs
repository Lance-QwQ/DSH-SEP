// Test-only passive observation: original spawn/fork and real children retained.
import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {appendFileSync} from 'node:fs';
const path=process.env.SEP_PROCESS_OBSERVATION;delete process.env.NODE_OPTIONS;
const save=value=>{try{appendFileSync(path,JSON.stringify({...value,parent:process.pid,at:Date.now()})+'\n');}catch{}};
for(const name of ['spawn','fork']){const original=childProcess[name];childProcess[name]=function(...args){const c=original.apply(this,args);save({kind:name,pid:c.pid,executable:String(args[0])});c.once('close',(code,signal)=>save({kind:'close',pid:c.pid,code,signal}));return c;};}syncBuiltinESMExports();
