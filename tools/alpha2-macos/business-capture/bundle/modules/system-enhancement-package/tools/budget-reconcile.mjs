#!/usr/bin/env node
import {readFile,writeFile,stat} from 'node:fs/promises';
import {planLegacyBudgetReconciliation,applyLegacyBudgetReconciliation} from '../src/budget-legacy-reconcile.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};
async function main(){
 const args=process.argv.slice(2);
 if(args.includes('--help')){
  process.stdout.write([
   'DSH SEP limited historical budget reconciliation (v1-only)',
   'Default is read-only plan; no automatic startup reconciliation.',
   '  node tools/budget-reconcile.mjs [plan] --budget <absolute-ledger.json> --out <new-private-plan.json>',
   '  node tools/budget-reconcile.mjs apply --budget <absolute-ledger.json> --plan <private-plan.json> --expected-plan-hash <sha256>',
   'Apply requires the exact reviewed hash, an unchanged v1 source, and the shared Budget writer lock.',
   'Apply appends one atomic correction set and preserves the original v1 checkpoint; replay is refused.',
   'Only reviewed settled Flash usage is repriced at peak all-cache-miss rates. This is not an invoice.',
   'Unknown reservations, Pro costs and initial spending remain unchanged. Keep the plan private.',
   'Stop paid writers and use the controlled deployment confirmation before a daily apply.',
   ''
  ].join('\n'));
  return;
 }
 const action=args[0]?.startsWith('--')?'plan':args.shift();
 if(!['plan','apply'].includes(action))fail('LEGACY_RECONCILE_CLI_ARGUMENTS');
 const options={},allowed=new Set(action==='plan'?['--budget','--out']:['--budget','--plan','--expected-plan-hash']);
 for(let index=0;index<args.length;index+=2){
  const key=args[index],value=args[index+1];
  if(!allowed.has(key)||Object.hasOwn(options,key)||!value||value.startsWith('--'))fail('LEGACY_RECONCILE_CLI_ARGUMENTS');
  options[key]=value;
 }
 if(!options['--budget'])fail('LEGACY_RECONCILE_CLI_ARGUMENTS');
 if(action==='plan'){
  if(!options['--out'])fail('LEGACY_RECONCILE_CLI_ARGUMENTS');
  const plan=await planLegacyBudgetReconciliation({budgetPath:options['--budget']});
  try{await writeFile(options['--out'],JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});}catch{fail('LEGACY_RECONCILE_OUTPUT');}
  process.stdout.write(JSON.stringify({status:'planned',isInvoice:false,planHash:plan.planHash,sourceSha256:plan.source.sha256,...plan.summary})+'\n');
 }else{
  if(!options['--plan']||!options['--expected-plan-hash'])fail('LEGACY_RECONCILE_CONFIRMATION');
  let plan;
  try{if((await stat(options['--plan'])).size>16*1024*1024)fail('LEGACY_RECONCILE_PLAN_INVALID');plan=JSON.parse(await readFile(options['--plan'],'utf8'));}catch{fail('LEGACY_RECONCILE_PLAN_INVALID');}
  const receipt=await applyLegacyBudgetReconciliation({budgetPath:options['--budget'],plan,expectedPlanHash:options['--expected-plan-hash']});
  process.stdout.write(JSON.stringify(receipt)+'\n');
 }
}
main().catch(error=>{
 const code=/^(?:LEGACY_RECONCILE_|BUDGET_)[A-Z_]+$/.test(error.code??'')?error.code:'LEGACY_RECONCILE_FAILED';
 process.stderr.write(JSON.stringify({status:'error',code})+'\n');process.exitCode=1;
});
