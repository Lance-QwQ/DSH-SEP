import './prepare-linux-attachment-ui-desktop.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve(process.env.SEP_BUNDLE_TEST_ROOT),file=join(root,'DESKTOP-FIXTURE.json'),f=JSON.parse(await readFile(file)),path=join(f.profile,'cordis.patch.yml'),patch=JSON.parse(await readFile(path));
const entry=patch.flatMap(x=>x.insert??[]).find(x=>x.id==='linux-cold-attachments');if(!entry)throw Error('FILE_UI_ATTACHMENT_ENTRY_MISSING');entry.config.files={enabled:true};await writeFile(path,JSON.stringify(patch,null,2)+'\n');await writeFile(file,JSON.stringify({...f,linuxFileUi:true},null,2)+'\n');
