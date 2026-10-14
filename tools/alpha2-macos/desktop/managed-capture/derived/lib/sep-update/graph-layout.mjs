import {join} from 'node:path';
const fail=()=>{throw Error('UPDATE_GRAPH_LAYOUT_INVALID');};
const indexes=new WeakMap();
const safe=value=>typeof value==='string'&&value.startsWith('node_modules/')&&!value.includes('\\')&&!value.includes(':')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[\x00-\x1f]/.test(part));
/** Schema 3 is the official materialized layout, with explicit, bound physical
 * package paths. It never infers an alias or widens a legacy store identity. */
export function packagePath(graph,id){
 if(graph.schema!==3)return 'store/'+id;
 if(graph.kind!=='dsh-sep-materialized-graph'||!graph.packagePaths||!Object.hasOwn(graph.packagePaths,id))fail();
 const path=graph.packagePaths[id];if(!safe(path))fail();return path;
}
export const packageRoot=(root,graph,id)=>join(root,...packagePath(graph,id).split('/'));
export function packageOwner(graph,path){
 if(graph.schema!==3){const parts=path.split('/');return parts[0]==='store'&&graph.packages.some(row=>row.id===parts[1])?{id:parts[1],path:parts.slice(2).join('/')}:null;}
 assertGraphLayout(graph);const index=indexes.get(graph);let prefix=path;
 for(;;){const at=prefix.lastIndexOf('/');if(at<0)return null;prefix=prefix.slice(0,at);const id=index.get(prefix);if(id)return {id,path:path.slice(prefix.length+1)};}
}
export function assertGraphLayout(graph){
 if(graph.schema!==3)return;
 if(indexes.has(graph))return;
 const seen=new Map(),ids=new Set();if(Object.keys(graph.packagePaths??{}).length!==graph.packages.length)fail();
 for(const row of graph.packages){const path=packagePath(graph,row.id);if(seen.has(path)||ids.has(row.id))fail();seen.set(path,row.id);ids.add(row.id);}
 for(const [name,id] of Object.entries(graph.roots??{}))if(packagePath(graph,id)!=='node_modules/'+name)fail();
 Object.values(graph.packages).forEach(Object.freeze);Object.freeze(graph.packages);Object.freeze(graph.packagePaths);Object.freeze(graph.roots);indexes.set(graph,seen);
}
