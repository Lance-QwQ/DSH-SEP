import {mkdir} from 'node:fs/promises';import {join} from 'node:path';
export async function prepareSmokeDirectories(dataRoot){
 const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:join(dataRoot,'home'),TMPDIR:join(dataRoot,'tmp'),LANG:'en_US.UTF-8'};
 for(const path of [dataRoot,env.HOME,env.TMPDIR])await mkdir(path,{recursive:true,mode:0o700});return env;
}
