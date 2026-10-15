// Successor derives from the byte-frozen native-business baseline. No mutation
// of that certified file and no platform-check-only Linux conversion.
import {readFile} from 'node:fs/promises';
import {hash} from '../business/bounded-read.mjs';
const file=new URL('../business/runtime.mjs',import.meta.url);let source=await readFile(file,'utf8');
export const origin=Object.freeze({source:'../business/runtime.mjs',sha256:'8148341384289ea23050112e70355dd26a52741c45ce7b715d3699ccbbf09409',transformations:[
 ['config.business.context||config.business.vision||config.business.click','config.business.context||config.business.click'],
 ["const carrier=ctx.sepMacProfile,local=", "const attachmentSelection=config.business.vision?ctx.get('sepMacAttachmentBinding'):undefined;\n if(config.business.vision&&(!attachmentSelection||attachmentSelection.source!==config.source||attachmentSelection.storageRoot!==config.memory))fail('SEP_MAC_ATTACHMENT_BINDING');\n const carrier=ctx.sepMacProfile,local="],
 ["vision:'disabled'","vision:config.business.vision?'explicit-upload; native-attachment-domain':'disabled'"],
 ["'visual-attachments',","...config.business.vision?[]:['visual-attachments'],"],
 ["available();yield* next(options);","available();if(attachmentSelection)await attachmentSelection.validate();yield* next(options);"],
 ["  const roots=[config.source", "  attachmentSelection?.bindRuntime(enter,abort.signal);\n  const roots=[config.source"],
 ["captureModel:config.p1.model,onControl:","captureModel:config.p1.model,attachmentSelection,onControl:"],
 ["fail('SEP_MAC_CHILD_READONLY');return next();","fail('SEP_MAC_CHILD_READONLY');if(exec.name==='suite_vision')await attachmentSelection.validate();return next();"],
]});
if(hash(source)!==origin.sha256)throw Error('SEP_MAC_MEDIA_RUNTIME_ORIGIN');for(const [before,after]of origin.transformations){if(source.split(before).length!==2)throw Error('SEP_MAC_MEDIA_RUNTIME_ANCHOR');source=source.replace(before,after);}
source=source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?"from '"+new URL(path,file).href+"'":all);
export const transformedSha256=hash(source);
export const {name,inject,apply}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
