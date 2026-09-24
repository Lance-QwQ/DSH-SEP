import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHostLifecycle as lifecycle} from './sep-host-lifecycle.mjs';
const mode=process.argv[2],entry=new URL('./overlay/p0498/lib/index.js',import.meta.url);
const source=await readFile(entry,'utf8');
const main=source.slice(source.indexOf('async function main()'),source.indexOf('\nif (import.meta.main)'));
process.env.DSH_SEP_HOST_NONCE='a'.repeat(64);process.env.DSH_SEP_HOST_GENERATION='1';
let resolveApp;
const pending=new Promise(resolve=>{resolveApp=resolve;});
const ctx={provide(){},plugin:async()=>{},connection:{authenticatedUrl:x=>x},webServer:{port:1,collectIndexInjections:()=>[]}};
const app={ctx,shutdown:{shutdown:async()=>{if(mode==='hang-shutdown')await new Promise(()=>{});if(mode==='fail-shutdown')throw Error('synthetic shutdown failure');}}};
process.on('message',value=>{if(value?.type==='fixture-resolve')resolveApp(app);});
const deps={process,join3:join,readFile2:async()=>JSON.stringify({version:'0.1.6-alpha.2'}),loadProfileDirectory:()=>({}),runProfile:()=>{if(mode==='fail-start'){setInterval(()=>{},1000);return Promise.reject(Error('synthetic partial boot failure'));}return mode==='pending'?pending:Promise.resolve(app);},loadLayeredEnv:()=>({}),fileURLToPath,installSepPluginPolicy(){},installDesktopUpdateTaskControl:()=>()=>false,resolveDshHome:()=>'',office_exports:{},console,createHostLifecycle:options=>lifecycle({...options,shutdownTimeoutMs:100})};
try{
 const work=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;${main.replaceAll('import.meta.url',JSON.stringify(entry.href))};return main();`)(deps);
 work.catch(()=>{});
 await new Promise(resolve=>setImmediate(resolve));
 if(process.connected)process.send({type:'fixture-entered'});
 await work;
}catch(error){console.error(error.code??error.message);process.exitCode=1;if(process.connected)process.disconnect();}
