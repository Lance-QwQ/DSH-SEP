import {frozen,transform,evaluate} from '../../../document-business/derive.mjs';
const file=new URL('../standalone.mjs',import.meta.url),source=await frozen(file,'d20e356c0a475c4acf1a5ec7f138bc21b36de4deea704e270d042c0b1b1e0128');
const derived=transform(source,[{before:"from './profile-layout.mjs'",after:"from '"+new URL('./profile-layout.mjs',import.meta.url).href+"'"}]);
export const origin=derived.receipt;
// Preserve every static and dynamic import's original filesystem identity;
// the only behavioral substitution above is the new trusted profile layout.
const absolute=derived.source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?"from '"+new URL(path,file).href+"'":all).replace(/import\('([^']+)'\)/g,(all,path)=>path.startsWith('.')?"import('"+new URL(path,file).href+"')":all);
export const {openMacBusiness}=await evaluate(absolute,file);
