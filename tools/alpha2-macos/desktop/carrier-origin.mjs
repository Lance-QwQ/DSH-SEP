import {createHash} from 'node:crypto';
const hashes={
 'apps/desktop/scripts/desktop-package-environment.mjs':'13cf364ba733e39ac765570b1c01450efd00e7c56f251086f102f9f703830c7d',
 'apps/desktop/scripts/electron-builder-config.mjs':'3f3b036aef8cff16b130b01c3512a2832473276b7cf9e79e59e648eac4e8c845',
 'apps/desktop/src/main.ts':'19aae691feeb41e459f2de0c1000f02d6bea02a4b9f5d3c59f3b02b7a628edac',
 'apps/desktop/scripts/smoke-packaged-runtime.ts':'5abd0d91b689c6f4fc2a23f8bd98948b7a2e81f409f3b45bb586ea7fc882159c',
};
export const carrierPaths=Object.freeze(Object.keys(hashes));
const sha=b=>createHash('sha256').update(b).digest('hex');
export function deriveCarrier(path,bytes){
 if(!Object.hasOwn(hashes,path))throw Error('SEP_MAC_CARRIER_SOURCE_UNKNOWN');
 if(sha(bytes)!==hashes[path])throw Error('SEP_MAC_CARRIER_ORIGIN_CHANGED');
 let text=bytes.toString('utf8');const changes=[];
 const replace=(from,to)=>{if(text.split(from).length!==2)throw Error('SEP_MAC_CARRIER_ANCHOR_CHANGED');text=text.replace(from,to);changes.push({from,to,occurrences:1});};
 if(path.endsWith('desktop-package-environment.mjs'))replace("DSH_DESKTOP_APP_ID: 'com.deepseek.harness'","DSH_DESKTOP_APP_ID: 'ai.dshsep.alpha2.preview'");
 if(path.endsWith('electron-builder-config.mjs')){
  replace("productName: 'DeepSeek Harness'","productName: 'DSH SEP'");
  replace("protocols: [{ name: 'DeepSeek Harness', schemes: ['dsh'] }]","protocols: [{ name: 'DSH SEP', schemes: ['dsh-sep'] }]");
 }
 if(path.endsWith('/main.ts')){
  replace('app.setAppLogsPath()',`app.setName('DSH SEP')
const sepDataRoot = process.env.DSH_SEP_DATA_ROOT ?? join(app.getPath('appData'), 'DSH SEP')
if (!sepDataRoot.startsWith('/') || sepDataRoot.includes('\\0')) throw new Error('SEP_MAC_DATA_ROOT_INVALID')
app.setPath('userData', join(sepDataRoot, 'electron'))
process.env.DSH_HOME = join(sepDataRoot, 'home')
app.setAppLogsPath(join(sepDataRoot, 'logs'))`);
  replace("app.setAsDefaultProtocolClient('dsh')","app.setAsDefaultProtocolClient('dsh-sep')");
  replace("url === 'dsh://open' || url === 'dsh://open/'","url === 'dsh-sep://open' || url === 'dsh-sep://open/'");
 }
 if(path.endsWith('smoke-packaged-runtime.ts')){
  replace("'DeepSeek Harness.app'","'DSH SEP.app'");
  replace("'MacOS', 'DeepSeek Harness'","'MacOS', 'DSH SEP'");
 }
 const result=Buffer.from(text);return {bytes:result,origin:{schema:1,officialCommit:'d743267388641bc76f17c45ce8b4c231aed1d32c',path,sourceSha256:hashes[path],resultSha256:sha(result),changes},changes};
}
