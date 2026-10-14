import{classifySettingsRound}from'./contracts.mjs';
export async function runSeries(runRound){
 const rounds=[];let status='pass';
 for(let index=1;index<=3;index++){
  if(status!=='pass'){rounds.push({index,status:'not_run',reason:'earlier predefined round failed or ownership was unconfirmed'});continue;}
  let value;try{value=await runRound(index);}catch(e){value={receipt:null,exit:null,error:{code:/^SEP_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_SETTINGS_OPERATOR_UNKNOWN'}};}
  const {receipt,exit}=value,outcome=classifySettingsRound(receipt?.round,receipt?.workerExit);
  if(!exit||exit.signal!==null||!Number.isInteger(exit.code))status='blocked';
  else if(outcome.status==='blocked')status='blocked';
  else status=receipt.status==='pass'&&outcome.status==='pass'&&exit.code===0&&receipt.roundNumber===index&&receipt.round.settings.persistedFromPriorColdStart===(index>1)?'pass':'fail';
  rounds.push({index,status,...value});
 }
 return {status,plannedRounds:3,rounds};
}
