// Portable composition tests explicitly substitute the service implementation.
// This file must never be in the application runtime allowlist.
import {source,filename} from './runtime-source.mjs';
import {evaluate,transform} from './derive.mjs';
const derived=transform(source,[{before:"from '../parser-integration/services.mjs'",after:"from '../document-business/test-services.mjs'"}]);
export const {name,inject,apply}=await evaluate(derived.source,filename);
