import {source,filename} from '../../../document-business/runtime-source.mjs';
import {derivePendingRuntime} from './runtime-source.mjs';
import {evaluate} from '../../../document-business/derive.mjs';
const derived=derivePendingRuntime(source,{document:true});
export const origin=derived.receipt;
export const {name,inject,apply}=await evaluate(derived.source,filename);
