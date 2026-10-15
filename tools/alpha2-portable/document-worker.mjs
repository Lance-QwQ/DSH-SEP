import {openManagedProject} from './managed-project.mjs';
const c=JSON.parse(process.argv[2]);
const p=await openManagedProject({...c,onEvent:event=>{if(event===c.phase)process.kill(process.pid,'SIGKILL');}});
await p.bindDocumentAuthority({identity:'synthetic-independent-authority',read:async()=>[c.marker]});
throw Error('EXPECTED_CRASH_NOT_REACHED');
