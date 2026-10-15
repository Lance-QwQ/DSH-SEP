import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import JsonlSessionPersistence from '../host/session-jsonl/index.js';
import {assertSepAppend,assertSepParent,governSepHandle} from './session-parent-proof.js';

const require=createRequire(import.meta.url);
const criticalPeers=['@deepseek-ai/dsh-session','@deepseek-ai/dsh-session-persistence','@deepseek-ai/dsh-session-format','@deepseek-ai/dsh-session-format-catalog','@deepseek-ai/dsh-session-format-v3-to-v4'];

/** Explicit Cordis provider for the pinned official host. Loading the root
 * bundle does not mount this provider or replace an existing host provider.
 * @param ctx - actual official Cordis context.
 * @param config - explicit native JSONL root and compression. */
export default class SepSessionPersistence extends JsonlSessionPersistence{
  constructor(ctx,config){
    for(const name of criticalPeers){
      let version;
      try{version=JSON.parse(readFileSync(require.resolve(name+'/package.json'),'utf8')).version;}
      catch{throw new Error('SEP_SESSION_HOST_UNSUPPORTED');}
      if(version!=='0.2.1-alpha.1')throw new Error('SEP_SESSION_HOST_UNSUPPORTED');
    }
    super(ctx,config);
  }
  async create(header,options){return governSepHandle(this,await super.create(header,options));}
  async open(id,access,options){
    const handle=await super.open(id,access,options);
    try{
      const result=await handle.read(0,Number.MAX_SAFE_INTEGER,options);
      await assertSepParent(this,handle.header,result.events,handle.inheritedEventCount,options);
      return governSepHandle(this,handle);
    }catch(error){await handle.close();throw error;}
  }
  async persistBatch(header,events,isMaterialized,inheritedEventCount){
    await assertSepAppend(this,header,events,isMaterialized,inheritedEventCount);
    return super.persistBatch(header,events,isMaterialized,inheritedEventCount);
  }
}
