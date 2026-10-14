// Test-only synthetic controller. Never imports or installs an actual payload.
// All modes have an explicit fixture-owned four-second lifetime. This is not
// production cleanup and cannot establish release of a real installer owner.
import { basename } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const mode=basename(import.meta.filename,'.mjs');
const [nonce,manifestSHA]=process.argv.slice(2);
if(!/^[a-f0-9]{64}$/.test(nonce??'')||!/^a{64}$/.test(manifestSHA??''))process.exit(23);
if(process.env.NODE_OPTIONS||process.env.SEP_TRANSPORT_SECRET)process.exit(24);
const deadline=setTimeout(()=>process.exit(19),4000);
const base=q=>({protocol:1,nonce,sequence:q.sequence,status:'pass'});
const preview=q=>({...base(q),phase:'preview',preview:{planHash:'b'.repeat(64),transactionId:'c'.repeat(32),target:'/Users/synthetic/Applications/安装 SEP.app',dataRoot:'/Users/synthetic/Library/Application Support/SEP',entries:2,totalBytes:1234,createApplications:true}});
const closed=q=>({...base(q),phase:'closed',resourcesReleased:true});
const frame=v=>Buffer.from(JSON.stringify(v)+'\n');
function finish(bytes,exit=0){process.stdin.destroy();process.stdout.write(bytes,()=>{process.stdout.end(()=>{clearTimeout(deadline);process.exitCode=exit;});});}
let pending=Buffer.alloc(0),accepted=0;
process.stdin.on('data',async chunk=>{
 pending=Buffer.concat([pending,chunk]);
 const newline=pending.indexOf(10);if(newline<0)return;
 const row=pending.subarray(0,newline);pending=pending.subarray(newline+1);
 let q;try{q=JSON.parse(row.toString('utf8'));}catch{process.exit(25);}
 if(q.nonce!==nonce||q.sequence!==++accepted||q.protocol!==1)process.exit(26);
 if(mode==='exit-eof'){
  if(q.operation!=='close')process.exit(27);
  // Exact fixture descendant retains only stdout for 350ms. Parent exit is
  // intentionally earlier than pipe EOF; it owns no installer state.
  const holder=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),350)'],{stdio:['ignore',process.stdout,'ignore'],env:{PATH:'/usr/bin:/bin'}});holder.unref();
  // Do not call stdout.end(): its stream shutdown can itself produce EOF even
  // while the inherited descriptor remains open in the holder. Terminate only
  // this synthetic parent after its frame has flushed, leaving holder fd alive.
  process.stdin.destroy();process.stdout.write(frame(closed(q)),()=>{clearTimeout(deadline);process.exit(0);});return;
 }
 if(mode==='race'){finish(frame(closed(q)));return;}
 if(mode==='wrong-nonce'){finish(frame({...preview(q),nonce:'d'.repeat(64)}));return;}
 if(mode==='wrong-sequence'){finish(frame({...preview(q),sequence:q.sequence+1}));return;}
 if(mode==='extra-field'){finish(frame({...preview(q),path:'/untrusted'}));return;}
 if(mode==='duplicate'){process.stdout.write(frame(preview(q)));await delay(20);finish(frame(preview(q)));return;}
 if(mode==='oversize'){finish(Buffer.alloc(16385,120));return;}
 if(mode==='invalid-utf8'){finish(Buffer.from([0x7b,0xc3,0x28,0x7d,10]));return;}
 if(mode==='truncated'){finish(Buffer.from('{"protocol":1'));return;}
 if(mode==='blocked'){
  process.stdout.write(frame({...base(q),status:'blocked',phase:'blocked',code:'SEP_INSTALLER_CLEANUP_UNCONFIRMED'}));
  process.stdin.destroy();setTimeout(()=>{clearTimeout(deadline);process.stdout.end();process.exitCode=9;},350);return;
 }
 if(q.operation==='close'){finish(frame(closed(q)));return;}
 if(mode==='slow')await delay(120);
 if(mode==='stderr')await new Promise(resolve=>process.stderr.write('PRIVATE-STDERR-CONTENT-'.repeat(100000),resolve));
 const response=q.operation==='listRecovery'?{...base(q),phase:'recovery-list',recoveries:[]}:q.operation==='cancel'?{...base(q),phase:'cancelled'}:preview(q);
 const bytes=frame(response);
 if(mode==='split'){
  const offset=bytes.indexOf(Buffer.from('安装'))+1;
  process.stdout.write(bytes.subarray(0,offset));await delay(20);process.stdout.write(bytes.subarray(offset));
 }else process.stdout.write(bytes);
});
process.stdin.on('end',()=>{if(mode==='slow')setTimeout(()=>{clearTimeout(deadline);process.stdout.end();},200);else if(!['blocked','exit-eof'].includes(mode)){clearTimeout(deadline);process.stdout.end();}});
