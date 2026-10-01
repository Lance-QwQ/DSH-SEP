#!/usr/bin/env node
import {readFile,lstat} from 'node:fs/promises';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const usage=()=>fail('P2_ADOPTION_RESTORE_USAGE');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
async function json(path){try{const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>16*1024*1024)fail('P2_ADOPTION_RESTORE_INPUT');return JSON.parse(await readFile(path,'utf8'));}catch{fail('P2_ADOPTION_RESTORE_INPUT');}}
try{
  const [command,path,...args]=process.argv.slice(2),commands=['prepare','validate','impact','confirm','restore','recover','status'];
  const acknowledgements=['--accept-baseline-restore','--accept-business-open'];
  const recovery={'--recover-token':'recoverLockToken','--budget-recover-token':'budgetRecoverToken','--admission-recover-token':'admissionRecoverToken'};
  if(!commands.includes(command)||!path)usage();
  if(command==='confirm'){
    if(!/^[a-f0-9]{64}$/.test(args[0]??'')||args.slice(1).some(a=>!acknowledgements.includes(a))||new Set(args.slice(1)).size!==args.length-1)usage();
  }else if(command==='recover'){
    if(args.length%2||args.some((a,i)=>i%2?!UUID.test(a):!Object.hasOwn(recovery,a))||new Set(args.filter((_,i)=>i%2===0)).size!==args.length/2)usage();
  }else if(args.length)usage();
  const input=await json(path),{createAdoptionBaselineRestore}=await import('./adoption-restore.js'),service=createAdoptionBaselineRestore();let result;
  if(command==='confirm'){
    const impact=await service.impact(input);
    process.stderr.write('恢复本库首个纳管基线：将恢复计划列明的三个数据域、配置、安装输入及封存代码。\n'+
      '覆盖范围包含这些域内的全部项目及共享档案；预算与当前删除依据不回退，保留原库且不恢复旧会话或发送模型请求。\n'+
      '基线后存在业务新写入或未决写入时拒绝恢复；健康检查和可靠提交完成后才允许受控业务开放。\n'+
      `计划：${JSON.stringify(impact.planHash)}\n目标：${JSON.stringify(impact.storageRoot)}\nProfile：${JSON.stringify(impact.profileRoot)}\n治理代次：${JSON.stringify(impact.epoch)}\n基线：${JSON.stringify(impact.firstBaseline)}\n恢复代码：${JSON.stringify(impact.artifact)}\n受影响文件：${JSON.stringify(impact.paths)}\n`);
    result=await service.confirm(input,args[0],{acceptBaselineRestore:args.includes('--accept-baseline-restore'),acceptBusinessOpen:args.includes('--accept-business-open')});
  }else if(command==='recover'){
    const options={};for(let i=0;i<args.length;i+=2)options[recovery[args[i]]]=args[i+1];result=await service.recover(input,options);
  }else result=await service[command](input);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result.status==='recovery_required'||result.cleanup?.complete===false)process.exitCode=2;
}catch(error){const code=typeof error?.code==='string'&&/^P2_[A-Z_]+$/.test(error.code)?error.code:'P2_ADOPTION_RESTORE_IO';process.stdout.write(JSON.stringify({status:'error',code})+'\n');process.exitCode=1;}
