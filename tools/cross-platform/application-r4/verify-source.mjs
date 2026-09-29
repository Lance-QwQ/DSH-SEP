import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,relative} from 'node:path';
const base=fileURLToPath(new URL('./',import.meta.url)),root=join(base,'source');
const raw=await readFile(join(base,'SOURCE-MANIFEST.json')),manifest=JSON.parse(raw),expected=new Map(manifest.files.map(f=>[f.path,f]));
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const p=join(dir,item.name);if(item.isDirectory())await walk(p);else{if(!item.isFile())throw Error('UNEXPECTED_FILE_TYPE');const rel=relative(root,p).split('\\').join('/'),f=expected.get(rel);if(!f)throw Error('UNEXPECTED_SOURCE:'+rel);const b=await readFile(p);if(b.length!==f.size||createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('SOURCE_MISMATCH:'+rel);expected.delete(rel);}}}
await walk(root);if(expected.size)throw Error('SOURCE_MISSING:'+expected.size);console.log(JSON.stringify({files:manifest.files.length,manifestSha256:createHash('sha256').update(raw).digest('hex'),status:'pass'}));