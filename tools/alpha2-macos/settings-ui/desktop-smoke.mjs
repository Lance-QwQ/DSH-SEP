import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
const file=new URL('../desktop/smoke-full.mjs',import.meta.url),pin='449c0fa85db1f0a4bfdb14820dcfa722e4b6156fcc9acc7009296241ef8ef5a9',fail=code=>{throw Object.assign(Error(code),{code});};
export function deriveDesktopSmoke(source){
 if(createHash('sha256').update(source).digest('hex')!==pin)fail('SEP_MAC_SETTINGS_SMOKE_ORIGIN');
 const before="row.realInspection='pass';";if(source.split(before).length!==2)fail('SEP_MAC_SETTINGS_SMOKE_ANCHOR');
 source=source.replace(before,before+'row.settingsPage=await probeSettingsPage({client,windowId:win.id,round:index});');
 source=source.replace("scope:'actual installed Mac preview core Profile + broker + Electron; three same-data cycles'","scope:'actual installed Mac image Profile + broker + Electron; rendered memory/budget controls, DOM changes and three same-data lifecycle cycles'");
 source=source.replace(/from '(\.[^']+)'/g,(_,path)=>"from '"+new URL(path,file).href+"'").replaceAll('import.meta.url',JSON.stringify(file.href));
 return "import {probeSettingsPage} from '"+new URL('./desktop-probe.mjs',import.meta.url).href+"';\n"+source;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await import('data:text/javascript;base64,'+Buffer.from(deriveDesktopSmoke(await readFile(file,'utf8'))).toString('base64'));
