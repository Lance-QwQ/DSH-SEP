import {posix} from 'node:path';
export function safeRelative(path){return typeof path==='string'&&path.length>0&&path.length<4096&&!path.startsWith('/')&&!/[\\\x00-\x1f\x7f]/.test(path)&&path.split('/').every(s=>s&&s!=='.'&&s!=='..');}
export function collectAsarEntries(header){
 const entries=new Map(),folded=new Set();
 function walk(node,prefix=''){for(const [name,value]of Object.entries(node.files??{})){
  const path=prefix+name;if(!safeRelative(path)||folded.has(path.toLowerCase())||!value||typeof value!=='object')throw Error('SEP_MAC_ASAR_PATH');folded.add(path.toLowerCase());
  if(value.link!==undefined&&!safeRelative(value.link))throw Error('SEP_MAC_ASAR_LINK');
  entries.set(path,value);if(value.files)walk(value,path+'/');
 }}walk(header);return entries;
}
export function safeLink(path,link){return typeof link==='string'&&!link.startsWith('/')&&!/[\\\x00-\x1f\x7f]/.test(link)&&safeRelative(posix.normalize(posix.join(posix.dirname(path),link)));}
