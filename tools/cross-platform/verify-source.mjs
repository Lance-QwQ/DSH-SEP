import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('.',import.meta.url));
const candidate=process.argv.includes('--candidate-r2')?'r2':process.argv.includes('--candidate')?'r1':null;
const manifest=JSON.parse(await readFile(join(root,candidate?'CANDIDATE-'+candidate.toUpperCase()+'-MANIFEST.json':'SOURCE-MANIFEST.json')));
let checked=0;
for(const file of manifest.records){const path=join(root,candidate?'candidate-'+candidate:'baseline',file.path),bytes=await readFile(path);assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);if(/\.(?:mjs|cjs|js)$/.test(path)){const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(r.status,0,'Syntax failure in '+file.path);checked++;}}
console.log(JSON.stringify({status:'pass',files:manifest.records.length,syntaxChecked:checked}));
