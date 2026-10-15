import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {deriveProjectAsar} from './derive-asar.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const BRIDGE_INPUTS=Object.freeze({
 'main.mjs':'add6c1a03c165c63fe61f007b7f261aaf5a23e5684db104f38f795f90a7b7696',
 'rules.mjs':'83dc0f51585f6871259bf42cc97b24cd06d8c038c107a16d47768a621acb5b6a',
 'transport.mjs':'65134282e54d2c7b70b98565a55615023740660ec9cb6b1bb5ae9658f2e7a7cb',
 'native-confirmation.mjs':'c4d91dd63e11f80059d7ab1dbd3c4427fec24310cebfb997a75575e8f2cfe7a5',
 'electron-adapter.mjs':'7673e4bde5cb6e44bb9a75758364b266818c5609561dfc9a7c05291aa6277986',
});
export const EXTRA_RUNTIME=Object.freeze([
 ...['business-host.mjs','host-owner.mjs','launch-full.mjs','overlay.mjs','profile-layout.mjs','profile-plugin.mjs','relay.mjs','standalone.mjs'].map(name=>'desktop/project-workflow-product/'+name),
 ...['host.mjs','rules.mjs','transport.mjs'].map(name=>'desktop/project-workflow-ui/'+name),
 ...['workflow-adapter.mjs','project-factory.mjs','derive-sources.mjs','derived-transaction-store.mjs','derived-lifecycle.mjs','preview.mjs','READONLY-ORIGIN.json'].map(name=>'project-workflow/'+name),
]);
export const RUNTIME_REPLACEMENT=Object.freeze({source:'desktop/project-workflow-product/controller.mjs',target:'bootstrap/controller.mjs'});
export const BUSINESS_ENTRY='Resources/product/runtime/desktop/project-workflow-product/standalone.mjs';
/** Build-only, explicit small inputs. Runtime consumers do not discover modules. */
export async function prepareProjectEdits({main,preload}){
 const edits=[];
 for(const [kind,bytes]of [['main',main],['preload',preload]]){const derived=deriveProjectAsar(kind,bytes);edits.push({domain:'asar',path:kind==='main'?'lib/main.js':'lib/preload-app.cjs',beforeSha256:sha(bytes),bytes:derived.bytes,sha256:derived.origin.resultSha256,origin:derived.origin});}
 const endpoint=await readFile(new URL('./endpoint.mjs',import.meta.url));edits.push({domain:'asar',path:'lib/project-workflow-product/endpoint.mjs',beforeSha256:null,bytes:endpoint,sha256:sha(endpoint)});
 for(const [name,pin]of Object.entries(BRIDGE_INPUTS)){const bytes=await readFile(new URL('../project-workflow-ui/'+name,import.meta.url));if(sha(bytes)!==pin)throw Error('SEP_PROJECT_PRODUCT_BRIDGE_CHANGED');edits.push({domain:'asar',path:'lib/project-workflow-ui/'+name,beforeSha256:null,bytes,sha256:pin});}
 for(const name of ['package.json','lib/index.js','lib/client.js']){const bytes=await readFile(new URL('./ui/'+name,import.meta.url));edits.push({domain:'host',path:'node_modules/@dsh-sep/current-project-ui/'+name,beforeSha256:null,bytes,sha256:sha(bytes)});}
 return {schema:1,scope:'derived r44 project UI inputs; not an installed or executed app',edits};
}
