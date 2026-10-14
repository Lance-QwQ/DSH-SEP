import {join} from 'node:path';
import {bundleRoot} from '../../../business/bundle-modules.mjs';
import {frozen,transform,evaluate,fail} from '../../../document-business/derive.mjs';
import {createParsedTools} from '../../../document-business/parsed-tools.mjs';
import {macContextPreparation} from '../../../document-business/context.mjs';
const file=join(bundleRoot,'bundle/lib/settings-consumers.js');
const source=await frozen(file,'cf964919de8d7dde9703e34f5634ff1e9c95b47c44b025e0849b7b52298c970f');
const common=[
 {before:'attachmentSelection,onControl})',after:'attachmentSelection,onControl,documentManagerFactory,documentDescription,metadataEnter,metadataAccess})'},
 {before:'documents=createDocumentManager({',after:'documents=documentManagerFactory({'},
 {before:"'Preview body-free document removal. Confirm only with the current direct user’s exact returned plan hash; deleting the original source requires separate explicit confirmation. Persistent P2 exclusions govern all three data domains.'",after:'documentDescription'},
 {before:"const release=enter('callback');try{if(closed)fail('SEP_BUSINESS_CLOSED');return await method(...args);",after:"const release=metadataEnter();try{if(closed)fail('SEP_BUSINESS_CLOSED');return await metadataAccess(()=>method(...args));"},
 {before:'createMemorySettingsService({scope,automatic:guardRecoverySettings(scope,automatic),signal,track,runAccess})',after:'createMemorySettingsService({scope,automatic:guardRecoverySettings(scope,automatic),signal,track,runAccess:metadataAccess})'},
];
const core=transform(source,common),document=transform(core.source,[
 {before:"import {ragTools} from '../modules/system-enhancement-package/src/rag.js';\n",after:''},
 {before:"import {mediaTools} from '../modules/system-enhancement-package/src/media.js';\n",after:''},
 {before:"import * as ContextPreparation from '../host/context-preparation/index.mjs';\n",after:''},
 {before:'metadataEnter,metadataAccess})',after:'metadataEnter,metadataAccess,ragTools,mediaTools,ContextPreparation})'},
]);
export const origin={core:core.receipt,document:document.receipt};
const originalCore=await evaluate(core.source,file),originalDocument=await evaluate(document.source,file);
export const businessConfig=originalCore.businessConfig;
function check(input){if(typeof input?.documentManagerFactory!=='function'||typeof input.documentDescription!=='string'||typeof input.metadataEnter!=='function'||typeof input.metadataAccess!=='function')fail('SEP_PENDING_CONSUMER_CONFIG');}
export function createCoreSettingsConsumers(ctx,input){check(input);return originalCore.createSettingsConsumers(ctx,input);}
export async function createSettingsConsumers(ctx,input){check(input);const factories=await createParsedTools(input.parserServices),ContextPreparation=await macContextPreparation(input.parserServices);return originalDocument.createSettingsConsumers(ctx,{...input,...factories,ContextPreparation});}
