import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_key, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k,x[k]])) : x);
export function derivePublishedPresetText(text) {
  const before='until the user approves your plan through exit_plan_mode or switches the session mode.',after='until exit_plan_mode succeeds or the user switches the session mode.';
  if(typeof text!=='string'||text.split(before).length!==2) throw Error('PRESET_PUBLIC_TRANSFORM');
  return text.replace(before,after);
}
export function comparePreset(defaultRow, overlay) {
  try {
    const expected = structuredClone({ id: defaultRow.id, config: defaultRow.config });
    const groups = expected.config.plugins.filter(x => x.id === 'compaction');
    if (groups.length !== 1 || groups[0].isolate?.compaction !== true) throw Error();
    const children = groups[0].config.filter(x => x.id === 'compaction-basic');
    if (children.length !== 1 || Object.hasOwn(children[0], 'disabled')) throw Error();
    delete groups[0].isolate.compaction;
    children[0].disabled = true;
    return { status: isDeepStrictEqual(expected, overlay) ? 'pass' : 'fail',
      transformations: ['remove-compaction-isolation','disable-compaction-basic'],
      expectedSha256: sha(canonical(expected)), actualSha256: sha(canonical(overlay)) };
  } catch { return { status:'fail', code:'PRESET_DEFAULT_SHAPE' }; }
}
export async function verifyPublicPresets({ programRoot, officialPackageRoot, officialSourceRoot, sourceCommit, graphPath, basePolicyPath, basePolicyCommit }) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw Error('PRESET_SOURCE_COMMIT');
  const require = createRequire(join(resolve(programRoot),'package.json'));
  const yaml = require('js-yaml');
  // Custom tags stay inert. No eval, profileContext, home patch, user state, or model is opened.
  const schema = yaml.DEFAULT_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js', {kind:'scalar',construct:value=>({__jsExpr:value})})]);
  const graphBytes = await readFile(graphPath);
  if (sha(graphBytes) !== '715ed1c0495d91bba2131029ec0475b2e735d1688b156ce269df149487427a2b') throw Error('PRESET_GRAPH_CHANGED');
  const graph = JSON.parse(graphBytes), files = [];
  const policyPath = 'node_modules/@deepseek-ai/dsh-desktop-host/lib/sep-policy.json';
  const policyBytes = await readFile(join(programRoot,policyPath));
  if (sha(policyBytes) !== 'df7e81c325b50ad6f823554442529513c2345febbe3f0a65d523b7b1f79d6ad0') throw Error('PRESET_POLICY_CHANGED');
  const policy = JSON.parse(policyBytes);
  const basePolicyBytes=await readFile(basePolicyPath);
  if(sha(basePolicyBytes)!=='05dcbee1fabf821638fbc6923dccf2f950cfbfa1c1982c2ce06098bd6aa600b7' || !/^[a-f0-9]{40}$/.test(basePolicyCommit) || !isDeepStrictEqual(JSON.parse(basePolicyBytes),policy.slice(0,4))) throw Error('PRESET_BASE_POLICY_CHANGED');
  const appended = policy.slice(4);
  if (policy.length !== 7 || !isDeepStrictEqual(appended.map(x=>x.id),['preset-standard','preset-ptc','preset-cordis'])) throw Error('PRESET_ROWS');
  for (const id of ['standard','ptc','cordis']) {
    const rel = `presets/${id}.patch.yml`, programPath = `node_modules/@deepseek-ai/dsh-web-app/${rel}`;
    const [published, official, program] = await Promise.all([readFile(join(officialPackageRoot,rel)),readFile(join(officialSourceRoot,'packages/bundle/web-app',rel)),readFile(join(programRoot,programPath))]);
    const hash = sha(program), row = graph.files.find(x=>x.path===programPath);
    if (!program.equals(published) || !program.equals(Buffer.from(derivePublishedPresetText(official.toString('utf8')))) || row?.sha256 !== hash || row?.size !== program.length) throw Error('PRESET_ORIGIN_CHANGED');
    const parsed = yaml.load(program.toString('utf8'),{schema});
    if (parsed.length!==1 || parsed[0].insert?.length!==1 || parsed[0].insert[0].id!==`preset-${id}`) throw Error('PRESET_DEFAULT_SHAPE');
    const compared=comparePreset(parsed[0].insert[0],appended.find(x=>x.id===`preset-${id}`));
    if(compared.status!=='pass') throw Error('PRESET_OVERLAY_CHANGED');
    files.push({id:`preset-${id}`,programPath,officialSourcePath:`packages/bundle/web-app/${rel}`,officialSourceSha256:sha(official),officialSourceBytes:official.length,
      officialToProgramTransformation:{kind:'one-exact-phrase-replacement',before:'until the user approves your plan through exit_plan_mode or switches the session mode.',after:'until exit_plan_mode succeeds or the user switches the session mode.'},
      sha256:hash,bytes:program.length,officialPackageSubsetByteEqual:true,...compared});
  }
  return {schema:1,status:'pass',scope:'All seven policy rows: four public SEP policy rows exactly match pinned source; three preset overlays mechanically derived from pinned official defaults by one public plan-mode phrase replacement and two declared compaction changes per preset; not original official bytes',
    sourceCommit,sourceCommitAuthentication:'operator-supplied pinned official source identity; local byte comparison does not authenticate GitHub',
    sourceGraphSha256:sha(graphBytes),policyPath,policySha256:sha(policyBytes),basePolicy:{status:'pass',rows:4,sourceCommit:basePolicyCommit,sourcePath:'tools/alpha2-desktop/source-overlay/apps/desktop-host/src/sep-policy.json',sourceSha256:sha(basePolicyBytes),sourceBytes:basePolicyBytes.length,comparison:'Exact parsed JSON equality; no omitted fields'},presets:files,
    expressions:'Preserved as exact inert __jsExpr strings; none evaluated',privateDataRead:false,
    excludedScope:['No daily profile, home patch, credentials, sessions, or provider requests','Does not certify arbitrary installed package contents or future preset changes']};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [programRoot,officialPackageRoot,officialSourceRoot,sourceCommit,graphPath,output,basePolicyPath,basePolicyCommit] = process.argv.slice(2);
  try { const result=await verifyPublicPresets({programRoot,officialPackageRoot,officialSourceRoot,sourceCommit,graphPath,basePolicyPath,basePolicyCommit}); await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'}); console.log(JSON.stringify({status:result.status,presets:result.presets.length,sha256:sha(await readFile(output))})); }
  catch(error) { console.error(JSON.stringify({status:'fail',code:/^PRESET_[A-Z_]+$/.test(error.message)?error.message:'PRESET_VERIFICATION_FAILED'}));process.exitCode=1; }
}
