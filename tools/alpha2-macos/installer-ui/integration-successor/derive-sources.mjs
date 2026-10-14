// Test/build operator only. Pure in-memory derivation; never writes pins or uploads.
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const pins={
 'package/restore-installer-application.mjs':'51f95045ccf121430acc622ea802fad1ae2cee165bfca9272e5dfedc81865617',
 'installer-ui/integration/run-full.mjs':'5acd9167b81d61e168ff1ee8b3bc117f37851c3e0b5ce90ca68e31f832aaf1ee',
 'installer-ui/integration/main-result.test.mjs':'5fd379be6ce0d22fefe21f9925d6f68824bb1dfc04b0dffdbe6e33213b82bccd',
 'installer-ui/integration/installed-startup.mjs':'e1b4a288612d43b2b93f0ba6e27eeaa0c2f851f13016dfc33ca0f36d08eaa01b',
 'installer-ui/integration/test-main.m':'6c588c90e2d1828e046682f8f91deabd5068b0d511aa602f02a3066d139c494a',
 'installer-ui/integration/installer-observer.m':'6adee71f937e2e00444495f06298b88214c3ca5a51575e855c44d870ea305f36',
 'installer-ui/integration/ci-job.yml':'a2fe9a824c32ec254ffb1c0a25bccde9d5dd4cac9d22d70f91608b934fbf8b44',
};
const oldCommit='1b5bcfa5c8a88fda7ad5727ee104eef8f8f0ad04';
const oldArchive='59550c42943c2b01a2bf770174d00d792304a5599f87387596ff99df8b0d49f1';
const payloadChanges=[
 ['0e8867766b0c01307959b935ced963ae0edd0eeb576cb62eb1c1c3a84ee1a732','e3d13eb3ce1dcc45e3afdb755682d3c56db25d47c7811159860cbb298c026834'],
 ['3b36e6443d277fce03502c2913cf27ff74660cdef12124a00c6a812aa2818836','ff97b34568f4cdf3d380191256b5523f1f27049b7e0c3a9afba16060da9fbc2b'],
 ['1f984a51666bb94068141be79e5d46fcf9d79d0cb6f1ba84127f4fb99d879991','eadad5720380302d460bea68f77d9cdfdf5dc4f7b7f77dd9cf0d10df3f7713a1'],
 ['742c503ba230ee9dd92f54b8c4646af3385dd1d6259fdfdcbc2212f2ff020d13','20dd042cdf53752e0ce4f6c93ae919bf895c844f0772cdf9f5b881b29b654107'],
];
export function deriveSuccessorSources(source,options){
 if(!options||!/^[a-f0-9]{40}$/.test(options.installerBuildCommit??'')||options.installerBuildCommit===oldCommit||!/^[a-f0-9]{64}$/.test(options.installerArchiveSha256??'')||options.installerArchiveSha256===oldArchive)fail('SEP_INSTALLER_DERIVATION_BINDING');
 for(const[path,pin]of Object.entries(pins))if(!Buffer.isBuffer(source?.get?.(path))||sha(source.get(path))!==pin)fail('SEP_INSTALLER_DERIVATION_SOURCE');
 const files=[],origins=[];
 function derive(path,result,changes){
  let text=source.get(path).toString('utf8');const transforms=[];
  for(const[from,to,expected=1]of changes){const n=text.split(from).length-1;if(n!==expected)fail('SEP_INSTALLER_DERIVATION_ANCHOR');text=text.split(from).join(to);transforms.push({from,to,occurrences:n});}
  const bytes=Buffer.from(text);files.push({path:result,bytes});const origin={source:path,sourceSha256:pins[path],result,resultSha256:sha(bytes),transforms};origins.push(origin);return origin;
 }
 derive('package/restore-installer-application.mjs','package/restore-installer-application-r78.mjs',[
  ['./installer-restore-pins.json','./installer-restore-pins-r78.json'],[oldCommit,options.installerBuildCommit],...payloadChanges.slice(0,2),
 ]);
 derive('installer-ui/integration/run-full.mjs','installer-ui/integration-r79/run-full.mjs',[
  ...payloadChanges,[oldCommit,options.installerBuildCommit],['fixed r61 installed first boot/restart','fixed r74 installed first boot/restart'],['installed-r61-product-first-boot-and-restart','installed-r74-product-first-boot-and-restart'],
  ['config.receipt.inventory.entries.length,29365','config.receipt.inventory.entries.length,29374'],['config.receipt.inventory.totalBytes,1794064040','config.receipt.inventory.totalBytes,1794083023'],["path:'installer-ui/integration/'+path","path:'installer-ui/integration-r79/'+path"],
 ]);
 derive('installer-ui/integration/main-result.test.mjs','installer-ui/integration-r79/main-result.test.mjs',[
  ['report.installed.entries,29365','report.installed.entries,29374'],['report.installed.totalBytes,1794064040','report.installed.totalBytes,1794083023'],
 ]);
 const startup=derive('installer-ui/integration/installed-startup.mjs','installer-ui/integration-r79/installed-startup.mjs',[payloadChanges[3]]);
 files.push({path:'installer-ui/integration-r79/installed-startup.origin.json',bytes:Buffer.from(JSON.stringify({schema:1,...startup,scope:'Exact r72 installed startup behavior. Only replace verified r61 payload archive with verified r74 archive; no path, deadline, action or cleanup changes.'},null,2)+'\n')});
 for(const name of ['test-main.m','installer-observer.m'])derive('installer-ui/integration/'+name,'installer-ui/integration-r79/'+name,[]);
 const oldWorkflow=source.get('installer-ui/integration/ci-job.yml').toString('utf8');
 derive('installer-ui/integration/ci-job.yml','installer-ui/integration-r79/ci-job.yml',[
  ['# Fixed r71 signed archive and restore pins.','# Fixed r78 signed archive and restore pins.'],['native-installer-integration:','native-installer-integration-r79:'],['name: installer-integration-native','name: installer-integration-native-r79'],
  ['package/restore-installer-application.mjs','package/restore-installer-application-r78.mjs'],['installer-ui/integration/run-full.mjs','installer-ui/integration-r79/run-full.mjs'],
  ['fixed-installer','fixed-installer-r79',oldWorkflow.split('fixed-installer').length-1],['/installer-integration','/installer-integration-r79',oldWorkflow.split('/installer-integration').length-1],
 ]);
 return{files,origins,pinsGenerated:false,bindings:{installerBuildCommit:options.installerBuildCommit,installerArchiveSha256:options.installerArchiveSha256,payloadBuildCommit:'155f324013fada4caf3ecd15a9631678d4d5c4a7',payloadAssemblySha256:'5aa8ddfc6b72141f494eb50e07cdced61e1fc89080368b9edf922389641f2704'}};
}
