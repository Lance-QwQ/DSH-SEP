#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {openControl} from './control.js';
import {createMaintenance} from './updater.js';

const usage=()=>{throw Object.assign(new Error('Commands: init <absolute-storage-root>; status <absolute-storage-root>; prepare <request.json>; validate <plan.json>; confirm <plan.json> <exact-hash>; switch <plan.json>; recover <plan.json> [--restore-old] [--recover-token token]'),{code:'P2_USAGE'});};
const json=async path=>JSON.parse(await readFile(path,'utf8'));
try{
  const [command,path,...args]=process.argv.slice(2);let result;
  if(!path)usage();
  if(command==='init'||command==='status'){
    if(args.length||!isAbsolute(path))usage();
    const c=await openControl({storageRoot:path,mode:'maintenance',initialize:command==='init'});
    try{result={status:command==='init'?'initialized':'status',storageRoot:c.storageRoot,checkpoint:await c.checkpoint()};}finally{await c.close();}
  }else{
    if(!['prepare','validate','confirm','switch','recover'].includes(command))usage();
    const service=createMaintenance();const input=await json(path);
    if(command==='confirm'){if(args.length!==1)usage();result=await service.confirm(input,args[0]);}
    else if(command==='recover'){
      const options={};for(let i=0;i<args.length;i++){if(args[i]==='--restore-old')options.restoreOld=true;else if(args[i]==='--recover-token'&&args[i+1])options.recoverLockToken=args[++i];else usage();}
      result=await service.recover(input,options);
    }else{if(args.length)usage();result=await service[command](input);}
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result.status==='recovery_required')process.exitCode=2;
}catch(error){process.stdout.write(JSON.stringify({status:'error',error:error.code??'P2_ERROR',message:error.message})+'\n');process.exitCode=1;}
