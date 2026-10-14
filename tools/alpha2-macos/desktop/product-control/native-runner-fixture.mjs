// Test-only independent child. No product runtime, application, or user data.
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const [mode,out]=process.argv.slice(2);
const cases=[1,2].map(index=>({index,status:'pass',cleanup:{status:'pass',resourcesConfirmedReleased:true}}));
async function result(blocked=false){await writeFile(join(out,'WORKER-RESULT.json'),JSON.stringify({schema:1,status:blocked?'blocked':'pass',cases:blocked?[{index:1,status:'blocked',cleanup:{status:'blocked',resourcesConfirmedReleased:false,generation:'c'.repeat(32)}}]:cases}));}
if(mode==='pass'||mode==='bad-exit'){await result();process.exitCode=mode==='pass'?0:1;process.disconnect();}
else {setInterval(()=>{},1000);if(mode==='blocked')await result(true);process.on('message',async message=>{if(message.kind==='requestCleanup'){await writeFile(join(out,'cleanup-request.json'),JSON.stringify(message));await result(true);}});}
