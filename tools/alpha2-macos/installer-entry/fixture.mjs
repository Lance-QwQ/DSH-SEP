import {mkdtemp,mkdir,writeFile,readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture as signedFixture,hash} from '../installation/fixture.mjs';
import {inventoryPackage} from '../package/package-inventory.mjs';
export {hash};
export async function setup() {
  const root=await mkdtemp(join(process.env.SEP_INSTALLER_TEST_ROOT,'case-'));
  const signed=await signedFixture(root),home=join(root,'account');
  await mkdir(home,{mode:0o700});
  await mkdir(join(home,'Library/Application Support'),{recursive:true,mode:0o700});
  await writeFile(join(home,'official-dsh-sentinel'),'unrelated official instance',{flag:'wx',mode:0o600});
  const config={
    sourceApp:signed.sourceApp,receipt:signed.receipt,
    coreHelper:{path:signed.helperPath,sha256:signed.helperSha256},
    entryHelper:{path:process.env.SEP_INSTALLER_TEST_HELPER,sha256:hash(await readFile(process.env.SEP_INSTALLER_TEST_HELPER))},
    testHome:home
  };
  return {root,home,config,source:signed.sourceApp,receipt:signed.receipt,
    parent:join(home,'Applications'),target:join(home,'Applications/DSH SEP.app'),
    dataRoot:join(home,'Library/Application Support/DSH SEP/alpha2-mac-finder-preview'),
    governance:join(home,'Library/Application Support/DSH SEP Installer')};
}
export async function missing(path){try{await lstat(path);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}}
export async function homeTree(f){return inventoryPackage(f.home);}
export const recordRoot=(f,id)=>join(f.governance,'transactions',id);
