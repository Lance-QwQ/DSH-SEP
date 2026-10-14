import {join} from 'node:path';
import {bundleRoot} from '../business/bundle-modules.mjs';
import {frozen,transform,cut,evaluate,fail,hash} from './derive.mjs';
export const origin=Object.freeze({
 rag:{path:'bundle/modules/system-enhancement-package/src/rag.js',sha256:'7ccc2618b83c01f6a02061b3f3b107c560b83cddf05f747843bddb8c1d127e3d'},
 media:{path:'bundle/modules/system-enhancement-package/src/media.js',sha256:'6873d53ce70c84dc158d9528ee68e6497381b94feae3469e78c391afe092eec3'},
 parser:{path:'bundle/modules/system-enhancement-package/src/parsers.js',sha256:'13ea4678c4554ee4e422eebff90af760452eeda701571b3686a66b8ccc5f6599'},
});
const parser=await frozen(join(bundleRoot,origin.parser.path),origin.parser.sha256);
// Import no host parser: even UTF-8 text must cross the trusted capability.
const constants=cut(parser,'export const PARSER_VERSION = ', '// Physical source lines');
const ragFile=join(bundleRoot,origin.rag.path),mediaFile=join(bundleRoot,origin.media.path),ragSource=await frozen(ragFile,origin.rag.sha256),mediaSource=await frozen(mediaFile,origin.media.sha256);
const rag=transform(ragSource,[
 {before:"import { parseDocument, PARSER_VERSION, DOCUMENT_EXTENSIONS } from './parsers.js';",after:constants},
 {before:'export function ragTools(scope,store,{layers}={}) {',after:'export function ragTools(scope,store,{layers,parseDocument}) {'},
]);
const media=transform(mediaSource,[
 {before:"import {parseDocument,inspectImage,PARSER_VERSION} from './parsers.js';\n",after:''},
 {before:"import {callDeepSeek} from './deepseek.js';\n",after:''},
 {before:'export function mediaTools(scope,store,{budget,resolveKey,model}) {',after:'export function mediaTools(scope,store,{parseDocument}) {'},
 {before:cut(mediaSource,'    async vision(project,{path,question},exec) {','  };\n}'),after:''},
]);
export const derivation=Object.freeze({rag:rag.receipt,media:media.receipt,constantsSha256:hash(constants)});
const [ragModule,mediaModule]=await Promise.all([evaluate(rag.source,ragFile),evaluate(media.source,mediaFile)]);
export async function createParsedTools(services){
 if(typeof services?.parseDocument!=='function')fail('SEP_MAC_DOCUMENT_PARSER_REQUIRED');
 const parseDocument=async(bytes,extension,{signal}={})=>{signal?.throwIfAborted();const result=await services.parseDocument({bytes,extension,signal});signal?.throwIfAborted();return result;};
 return Object.freeze({
  ragTools:(scope,store,{layers}={})=>ragModule.ragTools(scope,store,{layers,parseDocument}),
  mediaTools:(scope,store)=>mediaModule.mediaTools(scope,store,{parseDocument}),
 });
}
