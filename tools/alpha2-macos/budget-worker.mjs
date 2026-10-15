// Synthetic child process, no provider or credentials.
import {Budget} from './captured/budget-ledger.js';
import {acquireBudgetLock} from './captured/budget-lock.js';
if(process.platform!=='darwin'||process.arch!=='arm64')process.exit(78);
const [action,path,id]=process.argv.slice(2);
if(action==='reserve'){
  const budget=new Budget(path,{limit:100});
  await budget.reserve(id,1,{scope:{kind:'task',taskId:id,rootSessionId:'synthetic-session',rootTurn:0}});
  console.log(JSON.stringify({status:'pass',id}));
}else if(action==='hold'){
  const held=await acquireBudgetLock(path);
  console.log(JSON.stringify({status:'ready',pid:process.pid}));
  await new Promise(resolve=>{process.stdin.resume();process.stdin.once('end',resolve);});
  await held.release();
}else process.exit(64);
