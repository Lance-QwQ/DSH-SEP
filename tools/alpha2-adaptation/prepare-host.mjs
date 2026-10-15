import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const [base,oldHost]=process.argv.slice(2).map(p=>resolve(p));
const inventory=JSON.parse(await readFile(join(base,'SOURCE-INVENTORY.json')));
const old=JSON.parse(await readFile(join(oldHost,'package.json')));
const dependencies={...old.dependencies};
// Required by the retained test-only React harness; match the official source's
// lower bound explicitly so dependency verification has no missing peer.
dependencies['@testing-library/dom']='10.4.1';
delete dependencies['@deepseek-ai/dsh-subagent-in-process-driver'];
const queue=Object.keys(dependencies),seen=new Set();
while(queue.length){
 const name=queue.shift();if(seen.has(name))continue;seen.add(name);
 const manifest=inventory.manifests[name];if(!manifest)continue;
 if(manifest.private)throw Error('PRIVATE_PACKAGE:'+name);
 dependencies[name]=manifest.version;
 for(const dependency of Object.keys({...manifest.dependencies,...manifest.peerDependencies,...manifest.optionalDependencies})){
  const target=inventory.manifests[dependency];if(!target||target.private)continue;
  dependencies[dependency]=target.version;queue.push(dependency);
 }
}
const host=join(base,'host-alpha2');await mkdir(host,{recursive:true});
await writeFile(join(host,'package.json'),JSON.stringify({name:'sep-alpha2-isolated-compatibility-host',private:true,type:'module',dependencies,devDependencies:old.devDependencies},null,2)+'\n',{flag:'wx'});
await writeFile(join(host,'pnpm-workspace.yaml'),'packages:\n  - .\nautoInstallPeers: false\nnodeLinker: hoisted\nstoreDir: '+join(base,'cache','pnpm-store').replaceAll('\\','/')+'\nallowBuilds:\n  "@deepseek-ai/dsh-subprocess-local": true\n  esbuild: true\n  koffi: true\n  node-pty: true\n  "@google/genai": false\n  protobufjs: false\n',{flag:'wx'});
await writeFile(join(base,'HOST-DEPENDENCIES.json'),JSON.stringify({schema:1,sourceCommit:'d743267388641bc76f17c45ce8b4c231aed1d32c',dependencies,retainedLegacyPackages:Object.keys(dependencies).filter(n=>n.startsWith('@deepseek-ai/')&&!inventory.manifests[n])},null,2)+'\n');
console.log(JSON.stringify({host,dependencies:Object.keys(dependencies).length}));
