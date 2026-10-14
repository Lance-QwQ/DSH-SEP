#!/usr/bin/env node
import {readFile,lstat} from 'node:fs/promises';
import {createAdoptionPreparation} from './adoption.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};
async function json(path){
  try{const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>16*1024*1024)fail('P2_ADOPTION_INPUT_JSON');return JSON.parse(await readFile(path,'utf8'));}
  catch{fail('P2_ADOPTION_INPUT_JSON');}
}
try{
  const [command,path,...args]=process.argv.slice(2);
  if(!['prepare','select','confirm','stage','status','cancel','recover','publish','publish-plan','recover-publish','recover-admission','review','impact','end-plan','end-maintenance'].includes(command)||!path)fail('P2_ADOPTION_USAGE');
  const flags=['--accept-staging-only','--accept-source-retirement'];
  const recoveryFlags=['--recover-token','--control-recover-token','--budget-recover-token','--admission-recover-token'];
  if(command==='select'&&args.length!==1||command==='review'&&(args.length!==3||!/^[1-9][0-9]*$/.test(args[2]))||
    command==='confirm'&&(!args[0]||args.slice(1).some(a=>!flags.includes(a)))||command==='stage'&&args.some(a=>!flags.includes(a))||
    command==='end-maintenance'&&(!args[0]||args.slice(1).some(a=>a!=='--accept-return-to-old'))||
    command==='recover'&&args.length!==0&&(args.length!==2||args[0]!=='--recover-token')||
    command==='recover-admission'&&(args.length!==2||args[0]!=='--admission-recover-token'||!/^[a-f0-9-]{36}$/.test(args[1]))||
    command==='publish-plan'&&args.length!==1||command==='publish'&&args.slice(1).some(a=>!['--accept-new-use','--accept-business-open'].includes(a))||
    command==='recover-publish'&&(args.length%2!==0||args.some((a,i)=>i%2===0?!recoveryFlags.includes(a):!/^[a-f0-9-]{36}$/.test(a)))||
    ['prepare','status','cancel','impact','end-plan'].includes(command)&&args.length!==0||new Set(args.filter(a=>a.startsWith('--'))).size!==args.filter(a=>a.startsWith('--')).length)fail('P2_ADOPTION_USAGE');
  if(command==='review'){const {assertReviewTerminal}=await import('./adoption-terminal.js');assertReviewTerminal();}
  const service=createAdoptionPreparation(),input=await json(path);let result;
  if(['confirm','stage'].includes(command)){
    const impact=await service.impact(input);process.stderr.write(impact.lines.join('\n')+'\n');
    if(!args.includes('--accept-staging-only')||impact.retirementEnabled&&!args.includes('--accept-source-retirement'))fail('P2_ADOPTION_IMPACT_ACK_REQUIRED');
  }
  if(command==='select')result=await service.select(input,await json(args[0]));
  else if(command==='publish-plan')result=await service.publishPlan(input,await json(args[0]));
  else if(command==='publish'){
    // Exact validation precedes actionable consequences; no memory bodies are rendered.
    if(input.kind!=='adoption-publication-v1')fail('P2_ADOPTION_NOT_READY');
    const impact=await service.publicationImpact(input);
    process.stderr.write('正式纳管：本次确认授权选定当前记忆的新使用及完成提交后的业务开放。\n旧历史、旧 L4、旧备份和缓存不进入新库；旧时代删除历史仍未知。\n原库内容保留，已退役权限保持；不会自动启动旧进程、恢复旧会话或发送模型请求。\n'+
      `计划：${JSON.stringify(impact.planHash)}\n新目标：${JSON.stringify(impact.storageRoot)}\n治理代次：${JSON.stringify(impact.epoch)}\n配置：${JSON.stringify(impact.configPath)}\n候选包：${JSON.stringify(impact.artifact)}\n选定记录数：${impact.selectedRecords}\n`+
      '只有 adopted、首个恢复基线及副本清理全部完成后才开放受控业务。\n');
    result=await service.publish(input,args[0],{acceptNewUse:args.includes('--accept-new-use'),acceptBusinessOpen:args.includes('--accept-business-open')});
  }
  else if(command==='recover-publish'){
    const options={};for(let i=0;i<args.length;i+=2)options[{'--recover-token':'recoverLockToken','--control-recover-token':'controlRecoverToken','--budget-recover-token':'budgetRecoverToken','--admission-recover-token':'admissionRecoverToken'}[args[i]]]=args[i+1];
    result=await service.recoverPublication(input,options);
  }
  else if(command==='confirm')result=await service.confirm(input,args[0]);
  else if(command==='recover-admission')result=await service.recoverAdmission(input,{recoverLockToken:args[1]});
  else if(command==='recover')result=await service.recover(input,args.length?{recoverLockToken:args[1]}:{});
  else if(command==='review'){const {showAdoptionReview}=await import('./adoption-terminal.js');result=await service.review(input,{owner:args[0],id:args[1],revision:Number(args[2])},showAdoptionReview);}
  else if(command==='end-plan')result=await service.endPlan(input);
  else if(command==='end-maintenance')result=await service.endMaintenance(input,args[0],{acceptReturnToOld:args.includes('--accept-return-to-old'),onPlan:async release=>{
    process.stderr.write('仅返回旧入口：恢复本事务计划中记录的原 DACL；不发布新库、不自动启动旧进程。\n恢复中断可能使部分旧路径已可写；不能假定全部停写。\n'+
      `返回计划：${release.hash}\n有效至：${new Date(release.expiresAt).toISOString()}\n写者 SID：${release.permissions.writerSid}\n`+
      release.permissions.entries.map(e=>`${e.state==='retired'?'恢复原权限':'保持原权限'}：${JSON.stringify(e.path)}`).join('\n')+'\n原/当前权限详情可在 end-plan 的无正文 JSON 中核对；此确认不代表旧业务健康已验证。\n');
  }});
  else result=await service[command](input);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.status==='adoption_recovery_required'||result.cleanup?.complete===false)process.exitCode=2;
}catch(error){
  // Native parser/errors may embed source snippets; expose only bounded codes.
  const code=typeof error.code==='string'&&/^(?:P2_|ADOPTION_)[A-Z_]+$/.test(error.code)?error.code:'P2_ADOPTION_IO';
  process.stdout.write(JSON.stringify({status:'error',code,...error.transactionId?{transactionId:error.transactionId,storageRoot:error.storageRoot}:{},...error.maintenanceMayHaveResumed?{maintenanceMayHaveResumed:true,action:'重新停旧进程并复核；部分旧路径可能已可写。'}:{}})+'\n');process.exitCode=1;
}
