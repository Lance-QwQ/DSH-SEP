import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {release} from 'node:os';
import assert from 'node:assert/strict';
const exec=promisify(execFile),source=fileURLToPath(new URL('.',import.meta.url));
assert(process.argv[2]);assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const output=resolve(process.argv[2]);await mkdir(output,{mode:0o700});
async function command(exe,args,label,env=process.env){let r;try{r=await exec(exe,args,{env,timeout:180000,maxBuffer:2097152});}catch(e){r=e;}await writeFile(join(output,label+'.log'),String(r.stdout??'')+'\n'+String(r.stderr??''),{flag:'wx'});if(r.code!==undefined)throw r;return r;}
const sys=await command('/usr/bin/sw_vers',[],'system');await writeFile(join(output,'platform.json'),JSON.stringify({platform:process.platform,arch:process.arch,darwin:release(),swVers:sys.stdout},null,2),{flag:'wx'});
const helper=join(output,'native-attachments');await command('/usr/bin/clang',['-O2','-Wall','-Wextra','-Werror',join(source,'native-attachments.c'),'-o',helper],'compile');
await command(process.execPath,['--test',join(source,'attachment-io.test.mjs')],'test',{...process.env,SEP_MAC_ATTACHMENT_TEST_ROOT:join(output,'cases'),SEP_MAC_ATTACHMENT_HELPER:helper});
