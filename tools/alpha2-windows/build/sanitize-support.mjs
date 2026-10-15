import {readFile,writeFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';import {portableShim} from './portable-shims.mjs';
const output=resolve(process.argv[2]??'');if(!/^D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1$/i.test(output))throw Error('SCOPE');
const sha=b=>createHash('sha256').update(b).digest('hex'),report=JSON.parse(await readFile(join(output,'privacy/SUPPORT-LOCAL-PATHS.json'))),records=[];
if(report.files.length!==16)throw Error('SHIM_COUNT_CHANGED');
for(const row of report.files){if(!/^runtime\/(?:pnpm|primary-runtime\/dependencies\/pnpm)\/node_modules\/\.bin\/(?:pn|pnpm|pnpx|pnx)(?:\.CMD)?$/.test(row.path))throw Error('SHIM_PATH');const before=await readFile(join(output,'support',row.path));if(sha(before)!==row.sha256)throw Error('SHIM_SOURCE_CHANGED');const after=portableShim(before.toString(),row.path.endsWith('.CMD')?'cmd':'sh');records.push({path:row.path,inputSha256:row.sha256,outputSha256:sha(after),body:after});}
for(const row of records)await writeFile(join(output,'support',row.path),row.body);
await writeFile(join(output,'SUPPORT-REDACTION.json'),JSON.stringify({schema:1,status:'pass',scope:'Remove fixed old development NODE_PATH block and cmd-shim-target comment; preserve original relative executable targets and argument forwarding',records:records.map(({body,...r})=>r)},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'pass',files:records.length}));
