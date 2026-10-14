import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {deriveReadiness} from './derive.mjs';import {deriveWelcome} from './welcome-derive.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Returns bytes and exact origins, never modifies an app. Bare desktop import
 * rewriting happens AFTER this chain, and must keep its own source/result hash. */
export async function composeDesktopReadiness(inputs){
 const outputs=[];
 function add(key,domain,path,bytes,origins=[]){outputs.push({key,domain,path,bytes,sha256:sha(bytes),origins});}
 const workspaceMain=deriveReadiness('main',inputs.main),welcomeMain=deriveWelcome('main',workspaceMain.bytes);
 add('main','asar','lib/main.js',welcomeMain.bytes,[workspaceMain.origin,welcomeMain.origin]);
 for(const[kind,path,domain]of [['preload','lib/preload-app.cjs','asar'],['frontend','dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-C5TXjxs_.js','asar'],['ui-renderer','node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js','host']]){const result=deriveReadiness(kind,inputs[kind]);add(kind,domain,path,result.bytes,[result.origin]);}
 for(const[kind,key,path]of [['preload','welcome-preload','lib/preload-welcome.cjs'],['script','welcome-script','lib/welcome/welcome.js'],['html','welcome-html','renderer/welcome.html']]){const result=deriveWelcome(kind,inputs[key]);add(key,'asar',path,result.bytes,[result.origin]);}
 for(const[key,file,path]of [['workspace-helper','main-gate.mjs','lib/sep-renderer-readiness.mjs'],['welcome-helper','welcome-gate.mjs','lib/sep-welcome-readiness.mjs']])add(key,'asar',path,await readFile(new URL(file,import.meta.url)));
 return{schema:1,scope:'combined fixed-byte readiness derivation only',outputs,notRun:['Actual React and Electron welcome/window readiness','Production transport integration','Finder launch','ASAR rebuild and signing']};
}
