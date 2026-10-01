import {realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';

const state=Symbol('lossless-state');
const digest=value=>createHash('sha256').update(value).digest('hex');
const inside=(root,path)=>{const rel=relative(root,path);return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));};

// The host's documented subclass hook owns summarization only. Range selection,
// tool pairing, shrink checks, source seqs and durable commit remain native.
export async function createLosslessCompaction(Basic,{projects,maxInputBytes=8*1024*1024}={}){
  if(typeof Basic!=='function'||typeof Basic.prototype.summarize!=='function')throw Error('LOSSLESS_HOST_CONTRACT');
  if(!Number.isSafeInteger(maxInputBytes)||maxInputBytes<1024||maxInputBytes>8*1024*1024)throw Error('LOSSLESS_CONFIG');
  if(!Array.isArray(projects)||!projects.length||projects.length>16)throw Error('LOSSLESS_CONFIG');
  const roots=[];
  for(const p of projects){
    if(typeof p.id!=='string'||!p.id||p.id.length>128||!isAbsolute(p.root??''))throw Error('LOSSLESS_CONFIG');
    const root=await realpath(p.root);
    if(resolve(root).toLowerCase()!==resolve(p.root).toLowerCase()||roots.some(x=>x.id===p.id||inside(x.root,root)||inside(root,x.root)))throw Error('LOSSLESS_PROJECT_SCOPE');
    roots.push({id:p.id,root});
  }
  return class LosslessCompaction extends Basic{
    [state]={lifetime:new AbortController(),workers:new Set(),verified:0,lastReceipt:undefined};
    constructor(ctx,config){
      super(ctx,config);
      ctx.effect(()=>async()=>{this[state].lifetime.abort(Error('LOSSLESS_DISPOSED'));await Promise.allSettled([...this[state].workers].map(w=>w.terminate()));});
    }
    losslessStatus(){return {phase:'native-compaction-source-integrity',automaticCompaction:this.config.auto,verified:this[state].verified,activeWorkers:this[state].workers.size,lastReceipt:this[state].lastReceipt&&structuredClone(this[state].lastReceipt),persistentGraph:false,automaticExpansion:false};}
    async summarize(input,agent,signal){
      const combined=AbortSignal.any([this[state].lifetime.signal,...(signal?[signal]:[])]);combined.throwIfAborted();
      const header=agent?.session?.header,cwd=header?.cwd;
      if(header?.origin==='subagent'||!isAbsolute(cwd??''))return super.summarize(input,agent,combined);
      const canonical=await realpath(cwd),project=roots.find(p=>inside(p.root,canonical));
      if(!project)return super.summarize(input,agent,combined);
      if(await realpath(project.root)!==project.root)throw Error('LOSSLESS_PROJECT_SCOPE');
      if(!Array.isArray(input.messages)||input.messages.length>4096)throw Error('LOSSLESS_INPUT_LIMIT');
      // Check before any model request. Never silently truncate the selected range.
      const records=[];let bytes=0;
      for(const message of input.messages){const json=JSON.stringify(message);bytes+=Buffer.byteLength(json);if(bytes>maxInputBytes)throw Error('LOSSLESS_INPUT_LIMIT');records.push(json);}
      const sourceHash=digest(JSON.stringify(records));
      const result=await super.summarize(input,agent,combined);combined.throwIfAborted();
      if(digest(JSON.stringify(input.messages.map(m=>JSON.stringify(m))))!==sourceHash)throw Error('LOSSLESS_INPUT_CHANGED');
      const summary=JSON.stringify(result.summary);
      if(Buffer.byteLength(summary)>1024*1024)throw Error('LOSSLESS_SUMMARY_LIMIT');
      if(this[state].workers.size>=2)throw Error('LOSSLESS_WORKER_LIMIT');
      const worker=new Worker(new URL('./lossless-integrity-worker.mjs',import.meta.url),{workerData:{projectId:project.id,records,summary},resourceLimits:{maxOldGenerationSizeMb:64}});
      this[state].workers.add(worker);
      try{
        const receipt=await new Promise((accept,reject)=>{
          let settled=false;
          const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);combined.removeEventListener('abort',abort);error?reject(error):accept(value);};
          const abort=()=>finish(combined.reason??Error('LOSSLESS_CANCELLED'));
          const timer=setTimeout(()=>finish(Error('LOSSLESS_WORKER_TIMEOUT')),10000);
          combined.addEventListener('abort',abort,{once:true});if(combined.aborted)abort();
          worker.once('message',value=>value.ok?finish(null,value.receipt):finish(Error('LOSSLESS_GRAPH_FAILED')));
          worker.once('error',()=>finish(Error('LOSSLESS_WORKER_FAILED')));
          worker.once('exit',()=>finish(Error('LOSSLESS_WORKER_EXIT')));
        });
        combined.throwIfAborted();
        if(receipt.sourceHash!==sourceHash||receipt.summaryHash!==digest(summary)||receipt.messageCount!==records.length)throw Error('LOSSLESS_GRAPH_MISMATCH');
        this[state].lastReceipt=receipt;this[state].verified++;
        // No extra model call and no changes to the native summary envelope.
        return result;
      }finally{await worker.terminate();this[state].workers.delete(worker);}
    }
  };
}
