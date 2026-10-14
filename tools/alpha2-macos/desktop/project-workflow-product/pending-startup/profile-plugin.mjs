import {frozen,transform,evaluate} from '../../../document-business/derive.mjs';
const file=new URL('../profile-plugin.mjs',import.meta.url);
const source=await frozen(file,'a7f47769954390635eee0fa486afb054904562b120ebaa5ba805dacec5d59c49');
const derived=transform(source,[{before:"from '../../profile/controlled-files.mjs'",after:"from './pending-startup/profile.mjs'"}]);
export const origin=derived.receipt;
const absolute=derived.source.replace(/from '(\.[^']+)'/g,(_all,path)=>"from '"+new URL(path,file).href+"'");
export const {name,inject,apply,createProfilePlugin}=await evaluate(absolute,file);
