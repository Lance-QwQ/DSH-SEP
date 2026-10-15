import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=process.env.SEP_BUNDLE_TEST_ROOT;
const asset='/opt/dsh-sep-cross-platform/alpha2-desktop-assets-20261013-r1/fonts/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
const sha256='b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a';
const load=async()=>import('./linux-desktop-fonts.mjs').catch(()=>({prepareDesktopFonts:undefined}));
test('private desktop font configuration selects the hash-bound CJK font without changing the system fallback',async()=>{
 const {prepareDesktopFonts}=await load();assert.equal(typeof prepareDesktopFonts,'function','private font preparation is required');
 const before=await promisify(execFile)('fc-match',['-f','%{file}',':lang=zh-cn']);
 const selected=await prepareDesktopFonts({root:join(root,'font-good'),font:asset,sha256});
 const result=await promisify(execFile)('fc-match',['-f','%{family}\n%{file}',':lang=zh-cn'],{env:{...process.env,FONTCONFIG_FILE:selected.config}});
 assert.match(result.stdout,/Noto Sans CJK SC/);assert(result.stdout.includes(selected.font));
 assert.equal((await promisify(execFile)('fc-match',['-f','%{file}',':lang=zh-cn'])).stdout,before.stdout);
 assert.equal(selected.sha256,sha256);assert((await readFile(selected.config,'utf8')).includes('cachedir'));
});
test('wrong font identity is refused before a configuration is published',async()=>{
 const {prepareDesktopFonts}=await load();assert.equal(typeof prepareDesktopFonts,'function');
 await assert.rejects(prepareDesktopFonts({root:join(root,'font-wrong'),font:asset,sha256:'0'.repeat(64)}),{code:'SEP_FONT_IDENTITY'});
});
test('desktop font preparation refuses a symlinked output root',async()=>{
 const {prepareDesktopFonts}=await load();assert.equal(typeof prepareDesktopFonts,'function');
 const target=join(root,'font-target'),alias=join(root,'font-alias');await mkdir(target,{mode:0o700});await symlink(target,alias);
 await assert.rejects(prepareDesktopFonts({root:alias,font:asset,sha256}),{code:'SEP_FONT_PATH'});
});
