import {frozen,transform,evaluate} from '../../../document-business/derive.mjs';
const file=new URL('../../../business/snapshot-scope.mjs',import.meta.url);
const source=await frozen(file,'075df32ed73c9f0a8ca050e11e009464b1114b9e7b7be1088c29cad93635866f');
const derived=transform(source,[
 {before:'{source,view,sources,workingDirectory,userProfile}){',after:`{source,view,sources,workingDirectory,userProfile,startupIdentity}){
 if(!Array.isArray(sources)||sources.length!==1||sources[0]!=='.'||typeof startupIdentity!=='function')fail('SEP_PENDING_SCOPE_CONFIG');
 let initializing=true,initialIdentity;
 const rootIdentity=async()=>{const identity=await startupIdentity();if(initialIdentity&&JSON.stringify(identity)!==JSON.stringify(initialIdentity))fail('SOURCE_CHANGED');initialIdentity??=identity;return identity;};`},
 {before:'const saved=get(target);if((await view()).version!==saved.view.version)',after:"const saved=get(target);if(saved.bootstrap){if(initializing)fail('SEP_PENDING_SCOPE_BODY');const snapshot=await view();return {part:'',row:{kind:'directory'},view:snapshot,physical:snapshot.path};}if((await view()).version!==saved.view.version)"},
 {before:"const snapshot=await view(),row=part?",after:"if(initializing){if(part!=='')fail('SEP_PENDING_SCOPE_BODY');await rootIdentity();const target=Object.freeze({displayPath,targetKey:displayPath});targets.set(target,{part:'',bootstrap:true});return target;}const snapshot=await view(),row=part?"},
 {before:'async stat(target,signal){const s=await fresh(target,signal);',after:"async stat(target,signal){if(initializing){signal?.throwIfAborted();if(!get(target).bootstrap)fail('SEP_PENDING_SCOPE_BODY');return {type:'directory',version:(await rootIdentity()).version};}const s=await fresh(target,signal);"},
 {before:'async listDir(target,signal){const s=',after:"async listDir(target,signal){if(initializing)fail('SEP_PENDING_SCOPE_BODY');const s="},
 {before:'async readBytes(target,signal,maxBytes){const s=',after:"async readBytes(target,signal,maxBytes){if(initializing)fail('SEP_PENDING_SCOPE_BODY');const s="},
 {before:'await scope.init();return scope;',after:'try{await scope.init();}finally{initializing=false;}return scope;'},
]);
export const origin=derived.receipt;
export const {createSnapshotScope}=await evaluate(derived.source,file);
