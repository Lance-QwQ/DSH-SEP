// Deployment-owned, per-instance Fontconfig. Never installs system/user fonts.
import {mkdir,readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function prepareDesktopFonts({root,font,sha256}){
 if(process.platform!=='linux'||!root?.startsWith('/opt/dsh-sep-cross-platform/')||!font?.startsWith('/opt/dsh-sep-cross-platform/')||!/^([a-f0-9]{64})$/.test(sha256??''))fail('SEP_FONT_PATH');
 for(const path of [root,font]){const absolute=resolve(path);if(absolute!==path)fail('SEP_FONT_PATH');try{if(await realpath(path)!==path)fail('SEP_FONT_PATH');}catch(e){if(e.code!=='ENOENT')throw e;}}
 const stat=await lstat(font);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)fail('SEP_FONT_IDENTITY');
 const bytes=await readFile(font);if(createHash('sha256').update(bytes).digest('hex')!==sha256)fail('SEP_FONT_IDENTITY');
 await mkdir(root,{mode:0o700});if(await realpath(root)!==root)fail('SEP_FONT_PATH');
 await mkdir(join(root,'fonts'),{mode:0o700});await mkdir(join(root,'cache'),{mode:0o700});
 const selected=join(root,'fonts/NotoSansCJK-Regular.ttc');await writeFile(selected,bytes,{mode:0o400,flag:'wx'});
 const config=join(root,'fonts.conf');await writeFile(config,'<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n<fontconfig>\n<include ignore_missing="no">/etc/fonts/fonts.conf</include>\n<dir>'+xml(join(root,'fonts'))+'</dir>\n<cachedir>'+xml(join(root,'cache'))+'</cachedir>\n<alias><family>sans-serif</family><prefer><family>Noto Sans CJK SC</family></prefer></alias>\n</fontconfig>\n',{mode:0o600,flag:'wx'});
 return {config,font:selected,sha256,scope:'private isolated desktop; FONTCONFIG_FILE opt-in only'};
}
