// TEST ONLY. Exercises the real derived owner without creating another store.
import {serveHost} from '../project-workflow-ui/transport.mjs';
export async function openMacBusiness(_input,{currentProject}){
 let closed=false;const server=serveHost(currentProject.port,{request:async(method,payload)=>({method,payload}),closeAdmission(){}},currentProject.binding);
 return {ready:{url:'http://127.0.0.1:32123/?token=abcdefghijklmnop',injections:[]},inspectQuit:async()=>({activeTasks:server.status().pending>0,scheduledTasks:false}),async close(){closed=true;server.closeAdmission();return {status:'pass',resourcesConfirmedReleased:true};}};
}
