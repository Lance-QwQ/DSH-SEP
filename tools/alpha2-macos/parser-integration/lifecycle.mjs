/** Internal aggregate; production passes only real createTrustedParser APIs. */
export function aggregateParserServices(parsers,binding,initializationUnknown=false){
 let closing=false,closedReceipt,resolveClosed,attempt;const released=parsers.map(()=>false),closed=new Promise(r=>{resolveClosed=r;});
 const blocked=()=>Object.freeze({status:'blocked',code:'SEP_PARSER_CLOSE_UNCONFIRMED',resourcesConfirmedReleased:false,retainedWork:true});
 function observe(){if(closing&&!initializationUnknown&&released.every(Boolean)&&!closedReceipt){closedReceipt=Object.freeze({status:'pass',resourcesConfirmedReleased:true,retainedWork:true});resolveClosed(closedReceipt);}}
 parsers.forEach((p,i)=>{void p.whenClosed().then(receipt=>{if(receipt?.status==='pass'&&receipt.resourcesConfirmedReleased===true)released[i]=true;observe();},()=>{});});
 function close(){closing=true;observe();if(closedReceipt)return Promise.resolve(closedReceipt);if(attempt)return attempt;let timer;
  const releases=Promise.all(parsers.map(async p=>{try{await p.close();}catch{/* The real completion promise remains the release authority. */}}));
  const current=Promise.race([releases.then(()=>{observe();return closedReceipt??blocked();}),new Promise(r=>{timer=setTimeout(()=>r(blocked()),5500);})]).finally(()=>{clearTimeout(timer);if(attempt===current)attempt=undefined;});attempt=current;return current;
 }
 function call(index,name,args){if(closing)return Promise.reject(Object.assign(Error('SEP_MAC_PARSER_CLOSED'),{code:'SEP_MAC_PARSER_CLOSED'}));return parsers[index][name](args);}
 function status(){const children=parsers.map(p=>p.status());return Object.freeze({admissionOpen:!closing&&!initializationUnknown&&children.length===2&&children.every(p=>p.admissionOpen===true),resourcesConfirmedReleased:Boolean(closedReceipt),parsers:children});}
 return Object.freeze({binding:Object.freeze({...binding}),parseContext:args=>call(0,'parseContext',args),parseDocument:args=>call(1,'parseDocument',args),close,whenClosed:()=>closed,status});
}
