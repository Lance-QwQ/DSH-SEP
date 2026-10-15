/** Port the existing inventory to explicit materialized package paths; all
 * integrity, profile, provenance, dependency and preservation checks remain. */
export function adaptUpdaterInventory(input){
 let text=input;const transforms=[];
 const replace=(from,to)=>{if(text.split(from).length!==2)throw Error('DAILY_INVENTORY_ORIGIN');text=text.replace(from,to);transforms.push({from,to});};
 const before=text.slice(text.indexOf(' const parts=rel.split'),text.indexOf('\n}\nasync function loosePackage'));
 if(!before.startsWith(" const parts=rel.split('/');"))throw Error('DAILY_INVENTORY_ORIGIN');
 replace(before,` const found=packageOwner(graph,rel);if(!found)return null;
 const owner=plugins.find(p=>p.instanceId==='package:'+found.id);if(!owner)return null;
 let walked=canonicalRoot;for(const part of rel.split('/')){walked=join(walked,part);if((await lstat(walked)).isSymbolicLink())return null;}
 const prefix=packagePath(graph,found.id),manifestPath=join(canonicalRoot,prefix,'package.json'),manifestRecord=graph.files.filter(f=>f.path===prefix+'/package.json');
 if(manifestRecord.length!==1||await fileHash(manifestPath)!==manifestRecord[0].sha256)return null;
 return {...owner,entryPath:found.path,entryFingerprint:fp};`);
 replace("const canonicalRoot=await realpath(root),packageRoot=join(canonicalRoot,'store',id);","const canonicalRoot=await realpath(root),packageDirectory=packageRoot(canonicalRoot,graph,id);");
 replace('resolve(packageRoot))','resolve(packageDirectory))');
 replace("['store',id,...parts]","[...packagePath(graph,id).split('/'),...parts]");
 replace('inside(packageRoot,path)','inside(packageDirectory,path)');
 replace("==='store/'+id+'/'+local","===packagePath(graph,id)+'/'+local");
 replace(" const hardBlocks=[],plugins=[],fingerprints=[],byId=new Map(),versions={};"," assertGraphLayout(graph);\n const hardBlocks=[],plugins=[],fingerprints=[],byId=new Map(),versions={};");
 replace("const f=graph.files[i],id=f.path.replaceAll('\\\\','/').split('/')[1];byId.get(id)?.push([f.path.split('/').slice(2).join('/'),actual[i]]);","const f=graph.files[i],owned=packageOwner(graph,f.path.replaceAll('\\\\','/'));if(owned)byId.get(owned.id)?.push([owned.path,actual[i]]);");
 replace("join(root,'store',p.id,'package.json')","join(packageRoot(root,graph,p.id),'package.json')");
 replace("peerAbsent(join(root,'store',id),name)","peerAbsent(packageRoot(root,graph,id),name)");
 replace("join(root,'store',id,'node_modules',name)","join(packageRoot(root,graph,id),'node_modules',name)");
 replace("resolve(root,'store',targetId).toLowerCase()","resolve(packageRoot(root,graph,targetId)).toLowerCase()");
 return {text:"import {packagePath,packageRoot,packageOwner,assertGraphLayout} from './graph-layout.mjs';\n"+text,transforms};
}
