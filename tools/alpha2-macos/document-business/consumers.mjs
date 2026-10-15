import {join} from 'node:path';
import {bundleRoot} from '../business/bundle-modules.mjs';
import {frozen,transform,evaluate,fail} from './derive.mjs';
import {createParsedTools} from './parsed-tools.mjs';
import {macContextPreparation} from './context.mjs';
export const origin=Object.freeze({path:'bundle/lib/settings-consumers.js',sha256:'cf964919de8d7dde9703e34f5634ff1e9c95b47c44b025e0849b7b52298c970f'});
const file=join(bundleRoot,origin.path),source=await frozen(file,origin.sha256);
const derived=transform(source,[
 {before:"import {ragTools} from '../modules/system-enhancement-package/src/rag.js';\n",after:''},
 {before:"import {mediaTools} from '../modules/system-enhancement-package/src/media.js';\n",after:''},
 {before:"import * as ContextPreparation from '../host/context-preparation/index.mjs';\n",after:''},
 {before:'attachmentSelection,onControl})',after:'attachmentSelection,onControl,documentManagerFactory,documentDescription,ragTools,mediaTools,ContextPreparation})'},
 {before:'documents=createDocumentManager({',after:'documents=documentManagerFactory({'},
 {before:"'Preview body-free document removal. Confirm only with the current direct user’s exact returned plan hash; deleting the original source requires separate explicit confirmation. Persistent P2 exclusions govern all three data domains.'",after:'documentDescription'},
]);
export const derivation=derived.receipt;
const original=await evaluate(derived.source,file);
export const businessConfig=original.businessConfig;
export async function createSettingsConsumers(ctx,input){
 if(typeof input?.documentManagerFactory!=='function'||typeof input.documentDescription!=='string')fail('SEP_MAC_DOCUMENT_CAPABILITY_REQUIRED');
 const factories=await createParsedTools(input.parserServices),ContextPreparation=await macContextPreparation(input.parserServices);
 return original.createSettingsConsumers(ctx,{...input,...factories,ContextPreparation});
}
