// Combined document/context/media candidate. Frozen source modules stay intact.
import {source,filename} from './runtime-source.mjs';
import {evaluate} from './derive.mjs';
export {origin,derivation} from './runtime-source.mjs';
export const {name,inject,apply}=await evaluate(source,filename);
