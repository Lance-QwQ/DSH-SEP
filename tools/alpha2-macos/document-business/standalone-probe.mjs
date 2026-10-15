import {frozen,transform,evaluate} from './derive.mjs';
const file=new URL('../business/standalone-probe.mjs',import.meta.url),source=await frozen(file,'bbadc2b1121e9dc7489a78aebdcbd28aec5c95cfca9591a2180ee2d57d4e9464');
const derived=transform(source,[
 {before:"from './standalone.mjs'",after:"from '../document-business/standalone.mjs'"},
 {before:"phase:'ready',status:response.status",after:"phase:'ready',settings:business.ready.settings,status:response.status"},
]);
await evaluate(derived.source,file);
