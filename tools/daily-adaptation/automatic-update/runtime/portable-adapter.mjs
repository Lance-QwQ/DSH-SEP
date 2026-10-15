import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
/** Release-producer operation only. This is included in the archive's graph;
 * installers must never rewrite downloaded code after its approval. */
export async function makePortableAdapter({root,fromRoot,sepVersion}){
 const adapter=join(root,'daily-adapter'),prefix=pathToFileURL(fromRoot).href.replace(/\/$/,'')+'/',origins=[];
 for(const name of await readdir(adapter)){
  if(!name.endsWith('.js'))continue;const path=join(adapter,name),input=await readFile(path,'utf8');let text=input;const transforms=[];
  for(const match of input.matchAll(/from '(file:[^']+)'/g)){
   if(!match[1].startsWith(prefix))throw Error('SEP_ADAPTER_EXTERNAL_IMPORT');const source=fileURLToPath(match[1]),local=relative(fromRoot,source),target=join(root,local),specifier=relative(adapter,target).replaceAll('\\','/');
   if(!specifier.startsWith('../node_modules/dsh-sep-bundle/bundle/'))throw Error('SEP_ADAPTER_EXTERNAL_IMPORT');const from=match[0],to="from '"+specifier+"'";
   if(text.split(from).length!==2)throw Error('SEP_ADAPTER_IMPORT_ORIGIN');text=text.replace(from,to);transforms.push({from,to});
  }
  await writeFile(path,text);origins.push({file:name,sourceSha256:sha(input),transforms,resultSha256:sha(text)});
 }
 const manifest=JSON.parse(await readFile(join(adapter,'package.json')));manifest.sep=sepVersion;await writeFile(join(adapter,'package.json'),JSON.stringify(manifest,null,2)+'\n');
 // The old original transforms remain as the first provenance leg.
 const original=JSON.parse(await readFile(join(adapter,'ORIGIN.json')));await writeFile(join(adapter,'ORIGIN.json'),JSON.stringify({schema:2,kind:'portable-daily-adapter',original,origins},null,2)+'\n');return origins;
}
