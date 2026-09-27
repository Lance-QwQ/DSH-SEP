import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
export const root=resolve(import.meta.dirname,'../../..');
export const installed=join(root,'dsh-daily/releases/sep-rc2-selfupdate-r06-20260925/node_modules');
export const load=name=>import(pathToFileURL(join(installed,'@deepseek-ai',name,'lib/index.js')).href);
export async function host(){
 const {Context}=await load('cordis');const ctx=new Context();
 for(const n of ['dsh-system-prompt','dsh-tools']){const p=await load(n);await ctx.plugin(p.default??p,n==='dsh-tools'?{mode:'native'}:{});}
 return ctx;
}
let sequence=0;
export function call(ctx,args,{signal=new AbortController().signal,session='fixture'}={}){
 return ctx.tools.execute({name:'suite_computer_click',arguments:args,callId:`test-${++sequence}`,agent:{session:{header:{id:session,cwd:import.meta.dirname}}},signal});
}
