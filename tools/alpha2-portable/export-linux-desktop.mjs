import {mkdir,cp,readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const generation=process.argv[2]??'r1';if(!/^r[1-9][0-9]*$/.test(generation))throw Error('GENERATION_SCOPE');
const output='D:/AIData/ProjectWork/DSH/alpha2-portable-profile-20261012-r1/desktop-inputs-'+generation;
const input='D:/AIData/ProjectWork/DSH/alpha2-desktop-continuation-20261012/alpha2-runtime-r6/node_modules/@deepseek-ai';
await mkdir(output);const rows=[];
for(const name of ['dsh-desktop','dsh-desktop-host']){
 const manifest=JSON.parse(await readFile(join(input,name,'package.json')));if(manifest.version!=='0.2.1-alpha.2')throw Error('DESKTOP_VERSION');
 await mkdir(join(output,name));for(const leaf of ['package.json','lib',...(name==='dsh-desktop'?['renderer','resources']:[])])await cp(join(input,name,leaf),join(output,name,leaf),{recursive:true,dereference:false,errorOnExist:true});
}
async function walk(base,relative=''){for(const name of await readdir(join(base,relative))){const p=join(relative,name),s=await lstat(join(base,p));if(s.isSymbolicLink())throw Error('DESKTOP_LINK');if(s.isDirectory())await walk(base,p);else rows.push({path:p.replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(join(base,p))).digest('hex')});}}
await mkdir(join(output,'dependencies'));for(const name of ['yauzl','pend'])await cp(join(input,'..',name),join(output,'dependencies',name),{recursive:true,dereference:false,errorOnExist:true});
await walk(output);await writeFile(join(output,'DESKTOP-INPUTS.json'),JSON.stringify({scope:'program-only Alpha.2 derived desktop; no data/configuration/credentials',rows},null,2)+'\n');console.log(JSON.stringify({output,files:rows.length}));
