// Test-only synthetic controller. Never imported by an installer/application.
import {Socket} from 'node:net';
import {runInstallerSession} from './controller-session.mjs';
const H='a'.repeat(64),T='b'.repeat(32);let session,release,resolveClosed;
const calls=[],closed=new Promise(r=>{resolveClosed=r;});let unlocked=false,consumed=false;
const report=(kind,value)=>process.send?.({kind,...value});
process.on('message',async message=>{
 if(message.kind==='boot'){
  const {mode,nonce}=message;
  const pass={status:'pass',resourcesReleased:true};
  const controller={
   async preview(){calls.push('preview');if(mode==='slow-preview')await new Promise(r=>{release=r;});return {status:'pass',phase:'preview',planHash:H,plan:{planHash:H,transactionId:T,target:'/Users/synthetic/Applications/DSH SEP.app',dataRoot:'/Users/synthetic/Library/Application Support/DSH SEP',actions:{createApplications:true},privateBody:'never emit this'}};},
   async cancel(input){calls.push(['cancel',input]);return {status:'pass',phase:'cancelled'};},
   async confirm(input){calls.push(['confirm',input]);if(mode==='slow-confirm')await new Promise(r=>{release=r;});if(consumed)throw Error('duplicate synthetic dispatch');consumed=true;return {status:'pass',phase:'committed',planHash:H,transactionId:T,target:'/Users/synthetic/Applications/DSH SEP.app',applicationStarted:mode==='bad-result'};},
   async resume(input){calls.push(['resume',input]);return {status:'pass',phase:'committed',planHash:H,transactionId:input.transactionId,target:'/Users/synthetic/Applications/DSH SEP.app',applicationStarted:false};},
   async listRecovery(){calls.push('listRecovery');return {status:'pass',entries:[{transactionId:T,status:'pass',phase:'committed',recoverable:true},{transactionId:'c'.repeat(32),status:'blocked',phase:'unknown',code:'SEP_INSTALLER_JOURNAL',recoverable:false}]};},
   async close(){calls.push('close');if(mode==='blocked-close'&&!unlocked)return {status:'blocked',resourcesReleased:false,code:'SEP_INSTALLER_CLEANUP_UNCONFIRMED'};if(mode!=='late-closed'||unlocked)resolveClosed(pass);return pass;},
   whenClosed:()=>closed,
  };
  let input,output;try{
   input=new Socket({fd:3,readable:true,writable:false});output=new Socket({fd:4,readable:false,writable:true});
   session=runInstallerSession({controller,nonce,input,output,fixedInventory:{entries:[{path:'one'},{path:'二'}],totalBytes:12345},closeDeadlineMs:120});
   session.whenClosed().then(receipt=>{report('closed',{receipt,calls});input.destroy();output.end(()=>{if(process.connected)process.disconnect();});});
   report('ready',{available:true});
  }catch(e){report('ready',{available:false,code:e.code});input?.destroy();output?.destroy();process.disconnect();process.exitCode=1;}
 }else if(message.kind==='snapshot')report('snapshot',{calls,status:session?.status()});
 else if(message.kind==='release'){unlocked=true;release?.();resolveClosed({status:'pass',resourcesReleased:true});report('released',{});}
 else if(message.kind==='close'&&session)report('close-result',{receipt:await session.close()});
});
