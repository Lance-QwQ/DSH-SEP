import './prepare-linux-continuation-desktop.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {hash} from './project-tree.mjs';
const root=resolve(process.env.SEP_BUNDLE_TEST_ROOT),fixture=join(root,'DESKTOP-FIXTURE.json'),f=JSON.parse(await readFile(fixture)),file=join(f.profile,'cordis.patch.yml'),patch=JSON.parse(await readFile(file));
const entry=patch.flatMap(x=>x.insert??[]).find(x=>x.id==='linux-sep-business');if(!entry)throw Error('CONTEXT_DESKTOP_ENTRY_MISSING');
const path=join(root,'public-context.json'),body=JSON.stringify({visibility:'public',task:{instance_id:'desktop-synthetic',repo:'synthetic/public',base_commit:'1'.repeat(40),problem_statement:'Inspect static Child inheritance.'},files:{'base.py':'class Base:\n pass\n','child.py':'from base import Base\nclass Child(Base):\n pass\n'}});
await writeFile(path,body,{mode:0o400,flag:'wx'});entry.config.business.context={enabled:true,python:'/usr/bin/python3',snapshots:[{id:'desktop-public',projectId:'desktop-public-project',root:f.source,path,sha256:hash(body)}]};
await writeFile(file,JSON.stringify(patch,null,2)+'\n');await writeFile(fixture,JSON.stringify({...f,contextSnapshotSha256:hash(body)},null,2)+'\n');
