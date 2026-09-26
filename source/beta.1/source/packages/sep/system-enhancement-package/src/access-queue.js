import {AsyncLocalStorage} from 'node:async_hooks';

/** In-process ordering for suite operations without the P2 coordinator. */
export function createAccessQueue(){
  const context=new AsyncLocalStorage();let tail=Promise.resolve();
  return fn=>{
    if(context.getStore()?.active)return Promise.resolve().then(fn);
    const work=tail.then(()=>{
      const owner={active:true};
      return context.run(owner,async()=>{try{return await fn();}finally{owner.active=false;}});
    });
    tail=work.catch(()=>{});return work;
  };
}
