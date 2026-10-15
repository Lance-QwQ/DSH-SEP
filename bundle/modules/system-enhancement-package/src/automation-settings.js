import {z} from 'zod';
import {fail} from './errors.js';

const pairSchema=z.object({capture:z.boolean(),recall:z.boolean()}).strict();
const partialSchema=pairSchema.partial();
const controls=state=>state.automation??{capture:true,recall:true,receipts:{}};
const matches=(left,right)=>left.capture===right.capture&&left.recall===right.recall;

/**
 * Existing project controls shared by the manual tool and the settings UI.
 * Callers own project authorization, lifetime and governed access. Reading and
 * ordinary no-ops do not initialize or publish storage. A competing write is
 * compared inside the store transaction; no new persisted revision is needed.
 */
export function createAutomationSettings(store,config){
  const view=auto=>({capture:auto.capture,recall:auto.recall,effectiveCapture:config.capture&&auto.capture,effectiveRecall:config.recall&&auto.recall,receiptCount:Object.keys(auto.receipts).length});
  const assign=(state,args)=>{
    const auto=state.automation??={capture:true,recall:true,receipts:{}};
    if(args.capture!==undefined)auto.capture=args.capture;
    if(args.recall!==undefined)auto.recall=args.recall;
    return view(auto);
  };
  return {
    /** Read or change only the supplied controls, preserving legacy tool calls. */
    async settings(project,input={}){
      const args=partialSchema.parse(input),current=controls(store.read(project));
      if((args.capture===undefined||args.capture===current.capture)&&(args.recall===undefined||args.recall===current.recall))return view(current);
      return store.transaction(project,state=>assign(state,args));
    },
    /** Compare controls and recheck the caller's cancellation inside the commit queue. */
    async updateSettings(project,input,expectedInput,{beforeCommit=()=>{}}={}){
      const desired=pairSchema.parse(input),expected=pairSchema.parse(expectedInput);
      const current=controls(store.read(project));
      // A lost response can be resolved by reading; repeating its already
      // committed desired value is also harmless and requires no publication.
      if(matches(current,desired)){await beforeCommit();return view(current);}
      return store.transaction(project,async state=>{
        await beforeCommit();
        const actual=controls(state);
        if(matches(actual,desired))return view(actual);
        if(!matches(actual,expected))fail('MEMORY_SETTINGS_CONFLICT');
        return assign(state,desired);
      });
    },
  };
}
