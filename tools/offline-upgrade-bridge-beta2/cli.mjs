import{isAbsolute}from'node:path';import{stageInstallation}from'./stage.mjs';import{prepareStaged}from'./prepare.mjs';import{acceptPlan,runPlan}from'./approval.mjs';
const[command,...args]=process.argv.slice(2);try{let result;
if(command==='stage'&&args.length===3)result=await stageInstallation({installationRoot:args[0],workRoot:args[1],targetRoot:args[2]});
else if(command==='prepare'&&args.length===1){const{report,...summary}=await prepareStaged(args[0]);result=summary;}
else if(command==='accept'&&args.length===5&&args[4]==='--accept-unknown-compatibility')result=await acceptPlan(args[0],{accepted:true,acceptedCompatibilityRisk:true,planHash:args[1],reportHash:args[2],graphHash:args[3]});
else if(['apply','recover'].includes(command)&&args.length===1)result=await runPlan(command,args[0]);else throw Error('BRIDGE_COMMAND_USAGE');
console.log(JSON.stringify(result));}catch(error){console.error(JSON.stringify({status:'failed',code:error.code??error.message,scope:'Inspect the retained work directory before retry; an error is not evidence that publication did not occur.'}));process.exitCode=1;}
