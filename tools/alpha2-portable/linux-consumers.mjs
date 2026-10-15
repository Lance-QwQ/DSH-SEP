// One hash-bound injection into the frozen Alpha.2 consumer factory. All
// consumer behavior and imports remain the real installed SEP implementation.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {bundleRoot} from './bundle-modules.mjs';
import {hash,fail} from './project-tree.mjs';
export const origin=Object.freeze({path:'bundle/lib/settings-consumers.js',sha256:'cf964919de8d7dde9703e34f5634ff1e9c95b47c44b025e0849b7b52298c970f',transformations:[
 ['attachmentSelection,onControl})','attachmentSelection,onControl,documentManagerFactory=createDocumentManager,documentDescription,contextPreparationPlugin=ContextPreparation,evaluationPlugin=Evaluation,computerClickPlugin=ComputerClick})'],
 ["import {validBackendPath} from '../host/evaluation-entry/backend-paths.mjs';",`import {validBackendPath} from '${new URL('./linux-evaluation-paths.mjs',import.meta.url).href}';`],
 ['{...Evaluation,apply:(child,input)=>Evaluation.apply(child,input,{signal,enter})}','{...evaluationPlugin,apply:(child,input)=>evaluationPlugin.apply(child,input,{signal,enter})}'],
 ['{...ComputerClick,apply:(child,input)=>ComputerClick.apply(child,input,{signal,enter,track,authorize:exec=>scope.caller(exec)})}','{...computerClickPlugin,apply:(child,input)=>computerClickPlugin.apply(child,input,{signal,enter,track,authorize:exec=>scope.caller(exec)})}'],
 ['{...ContextPreparation,apply:(child,input)=>ContextPreparation.apply(child,input,{signal,enter})}','{...contextPreparationPlugin,apply:(child,input)=>contextPreparationPlugin.apply(child,input,{signal,enter})}'],
 ['documents=createDocumentManager({','documents=documentManagerFactory({'],
 ["'Preview body-free document removal. Confirm only with the current direct user’s exact returned plan hash; deleting the original source requires separate explicit confirmation. Persistent P2 exclusions govern all three data domains.'","documentDescription??'Preview body-free document removal. Confirm only with the current direct user’s exact returned plan hash; deleting the original source requires separate explicit confirmation. Persistent P2 exclusions govern all three data domains.'"],
]});
const filename=join(bundleRoot,origin.path),require=createRequire(filename);let source=await readFile(filename,'utf8');
if(hash(source)!==origin.sha256)fail('SEP_LINUX_CONSUMER_ORIGIN_CHANGED');
for(const [before,after]of origin.transformations){if(source.split(before).length!==2)fail('SEP_LINUX_CONSUMER_TRANSFORM');source=source.replace(before,after);}
// A data URL has no filesystem parent, so preserve resolution at the original
// module (including its exact zod dependency), rather than at this controller.
source=source.replace(/from '([^']+)'/g,(all,name)=>name.startsWith('node:')||name.startsWith('file:')?all:"from '"+pathToFileURL(require.resolve(name)).href+"'");
export const transformedSha256=hash(source);
const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
export const {createSettingsConsumers,businessConfig}=module;
