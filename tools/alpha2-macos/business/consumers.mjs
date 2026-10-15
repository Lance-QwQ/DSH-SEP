// Exact captured SEP factory with an obligatory Mac document capability.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {bundleRoot} from './bundle-modules.mjs';
import {hash} from './bounded-read.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
export const origin=Object.freeze({path:'bundle/lib/settings-consumers.js',sha256:'cf964919de8d7dde9703e34f5634ff1e9c95b47c44b025e0849b7b52298c970f',transformations:[
 ['attachmentSelection,onControl})','attachmentSelection,onControl,documentManagerFactory,documentDescription})'],
 ['documents=createDocumentManager({','documents=documentManagerFactory({'],
 ["'Preview body-free document removal. Confirm only with the current direct user’s exact returned plan hash; deleting the original source requires separate explicit confirmation. Persistent P2 exclusions govern all three data domains.'",'documentDescription'],
]});
const filename=join(bundleRoot,origin.path),require=createRequire(filename);let source=await readFile(filename,'utf8');
if(hash(source)!==origin.sha256)fail('SEP_MAC_CONSUMER_ORIGIN_CHANGED');
for(const [before,after]of origin.transformations){if(source.split(before).length!==2)fail('SEP_MAC_CONSUMER_TRANSFORM');source=source.replace(before,after);}
source=source.replace(/from '([^']+)'/g,(all,name)=>name.startsWith('node:')||name.startsWith('file:')?all:"from '"+pathToFileURL(require.resolve(name)).href+"'");
export const transformedSha256=hash(source);
const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
export const businessConfig=module.businessConfig;
export function createSettingsConsumers(ctx,input){if(typeof input.documentManagerFactory!=='function'||typeof input.documentDescription!=='string')fail('SEP_MAC_DOCUMENT_CAPABILITY_REQUIRED');return module.createSettingsConsumers(ctx,input);}
