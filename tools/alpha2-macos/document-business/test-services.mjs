// Deliberately synthetic; imported only by test-runtime.mjs, never production.
export const calls=[],instances=[];
let handler,blocked=false;
export function configure({parseDocument,holdClose=false}={}){handler=parseDocument;blocked=holdClose;calls.length=0;instances.length=0;}
export async function openParserServices(binding){
 let closing=false,closed=false,resolveClose;const closedPromise=new Promise(r=>{resolveClose=r;});
 const api={binding:Object.freeze({...binding}),parseContext:async()=>JSON.stringify({synthetic:'context'}),async parseDocument(input){if(closing)throw Object.assign(Error('SEP_MAC_PARSER_CLOSED'),{code:'SEP_MAC_PARSER_CLOSED'});calls.push(input);return handler?handler(input):{parserVersion:'suite-parser-2/fflate-0.8.3/fxp-5.11.1/pdfjs-6.2.108/canvas-1.0.8',parts:[{text:'synthetic governed parser token',locator:{lineStart:1,lineEnd:1}}],warnings:[]};},close(){closing=true;if(!blocked)api.release();return Promise.resolve({status:closed?'pass':'blocked',resourcesConfirmedReleased:closed});},whenClosed:()=>closedPromise,status:()=>({admissionOpen:!closing,resourcesConfirmedReleased:closed,parsers:[]}),release(){closed=true;resolveClose({status:'pass',resourcesConfirmedReleased:true});}};
 instances.push(api);return api;
}
