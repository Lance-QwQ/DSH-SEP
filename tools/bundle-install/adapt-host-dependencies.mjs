import { createHash } from 'node:crypto';

// Fixed alpha.1 declaration adaptation, not a blanket runtime-compatibility claim.
// The graph-bound modules/manifests stay immutable; run this AFTER module capture.
export const SOURCE_PEERS=Object.freeze({
  "@deepseek-ai/cordis": "4.0.4 || ~4.0.4",
  "@deepseek-ai/dsh-agent": "0.2.0-rc.2",
  "@deepseek-ai/dsh-brand": "0.2.0-rc.2",
  "@deepseek-ai/dsh-client-connection": "0.2.0-rc.2",
  "@deepseek-ai/dsh-client-locale": "0.2.0-rc.2",
  "@deepseek-ai/dsh-client-ui-primitives": "0.2.0-rc.2",
  "@deepseek-ai/dsh-client-ui-settings": "0.2.0-rc.2",
  "@deepseek-ai/dsh-client-ui-sidebar": "0.2.0-rc.2",
  "@deepseek-ai/dsh-client-ui-slots": "0.2.0-rc.2",
  "@deepseek-ai/dsh-compaction-basic": "0.2.0-rc.2",
  "@deepseek-ai/dsh-fs": "0.2.0-rc.2",
  "@deepseek-ai/dsh-invariants": "0.2.0-rc.2",
  "@deepseek-ai/dsh-llm": "0.2.0-rc.2",
  "@deepseek-ai/dsh-session": "0.2.0-rc.2",
  "@deepseek-ai/dsh-session-format": "0.2.0-rc.2",
  "@deepseek-ai/dsh-session-persistence": "0.2.0-rc.2",
  "@deepseek-ai/dsh-session-persistence-jsonl": "0.2.0-rc.2",
  "@deepseek-ai/dsh-storage-domain": "0.2.0-rc.2",
  "@deepseek-ai/dsh-subagent": "0.2.0-rc.2",
  "@deepseek-ai/dsh-tools": "0.2.0-rc.2",
  "@deepseek-ai/dsh-util-values": "0.2.0-rc.2",
  "@deepseek-ai/schemastery": "3.18.4 || ~3.18.4",
  "react": "18.3.1",
  "@deepseek-ai/dsh-session-format-v3-to-v4": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-compaction-image-offload": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-session-format-catalog": "0.2.1-alpha.1",
  "@deepseek-ai/node-addon-system": "0.1.2",
  "koffi": "3.1.1",
  "@deepseek-ai/dsh-fs-local": "0.2.1-alpha.1",
  "chokidar": "4.0.3",
  "@deepseek-ai/dsh-fs-observation-policy": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-tool-fs": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-sandbox-policy": "0.2.1-alpha.1"
});
export const TARGET_PEERS=Object.freeze({
  "@deepseek-ai/cordis": "4.0.5-alpha.1",
  "@deepseek-ai/cordis-plugin-loader": "1.0.6-alpha.1",
  "@deepseek-ai/dsh-attachment-local": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-agent": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-brand": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-client-connection": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-client-locale": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-client-ui-primitives": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-client-ui-settings": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-client-ui-sidebar": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-client-ui-slots": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-compaction-basic": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-fs": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-invariants": "0.2.0-rc.2 || 0.2.1-alpha.1",
  "@deepseek-ai/dsh-llm": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-session": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-session-format": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-session-persistence": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-session-persistence-jsonl": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-storage-domain": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-subagent": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-tools": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-util-values": "0.2.1-alpha.1",
  "@deepseek-ai/schemastery": "3.18.5-alpha.1",
  "react": "18.3.1",
  "@deepseek-ai/dsh-session-format-v3-to-v4": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-compaction-image-offload": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-session-format-catalog": "0.2.1-alpha.1",
  "@deepseek-ai/node-addon-system": "0.1.2",
  "koffi": "3.1.1",
  "@deepseek-ai/dsh-fs-local": "0.2.1-alpha.1",
  "chokidar": "4.0.3",
  "@deepseek-ai/dsh-fs-observation-policy": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-tool-fs": "0.2.1-alpha.1",
  "@deepseek-ai/dsh-sandbox-policy": "0.2.1-alpha.1"
});
const names=Object.keys(SOURCE_PEERS).sort();
const additions=['@deepseek-ai/cordis-plugin-loader','@deepseek-ai/dsh-attachment-local'];
const equalKeys=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[names,[...names,additions[0]].sort(),[...names,...additions].sort()].some(keys=>JSON.stringify(Object.keys(value).sort())===JSON.stringify(keys));
const reject=code=>{throw new Error(code);};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Pure, repeatable metadata transformation. Never installs, activates or writes. */
export function adaptHostDependencies(input) {
  if(!equalKeys(input?.peerDependencies))reject('BUNDLE_HOST_PEERS_CHANGED');
  if(!equalKeys(input.peerDependenciesMeta))reject('BUNDLE_HOST_PEER_META');
  for(const name of names){
    if(![SOURCE_PEERS[name],TARGET_PEERS[name]].includes(input.peerDependencies[name]))reject('BUNDLE_HOST_PEER_RANGE');
    const meta=input.peerDependenciesMeta[name];
    if(!meta||meta.optional!==true||Object.keys(meta).length!==1)reject('BUNDLE_HOST_PEER_META');
  }
  for(const name of additions){
    if(name in input.peerDependencies&&input.peerDependencies[name]!==TARGET_PEERS[name])reject('BUNDLE_HOST_PEER_RANGE');
    const meta=input.peerDependenciesMeta[name];if(meta&&(meta.optional!==true||Object.keys(meta).length!==1))reject('BUNDLE_HOST_PEER_META');
    if(name in input.peerDependencies&&!meta)reject('BUNDLE_HOST_PEER_META');
  }
  const manifest={...structuredClone(input),peerDependencies:{...TARGET_PEERS},peerDependenciesMeta:{...structuredClone(input.peerDependenciesMeta),...Object.fromEntries(additions.map(name=>[name,{optional:true}]))}};
  manifest.dshSepBundle={...manifest.dshSepBundle,hostDependencyContract:'./bundle/contracts/host-dependencies.json'};
  const contract={schema:1,scope:'dependency-resolution',targetHostVersion:'0.2.1-alpha.1',
    sourcePeerDependencies:{...SOURCE_PEERS},targetPeerDependencies:{...TARGET_PEERS},
    sourcePeersSha256:digest(SOURCE_PEERS),targetPeersSha256:digest(TARGET_PEERS),
    peerOptionality:'prior 33 unchanged; exact optional Loader and native attachment-local added for explicit controlled entries; missing optional peers do not imply feature readiness',
    reviewedAdditions:{'@deepseek-ai/cordis-plugin-loader':'1.0.6-alpha.1','@deepseek-ai/dsh-attachment-local':'0.2.1-alpha.1'},
    runtimeCompatibility:'not_run',defaultBundleAdmission:'pending',businessActivationAllowed:false,
    capturedModules:'bundle/contracts/modules.json is historical source provenance and is not rewritten',
    officialGateBridge:{package:'@deepseek-ai/dsh-invariants',installedVersion:'0.2.0-rc.2',runtimeVersion:'0.2.1-alpha.1',reason:'official gate compares all dsh-* peers to the host version; exact union accepts the installed leaf and only the fixed host'},
    evidence:'Installed peer versions must satisfy declared ranges; actual pnpm peers check and official runtime gate are separate required checks. This contract alone certifies no runtime feature.',
    notIncluded:['native client discovery','deployed BrowserAuth','all business consumers','complete runtime compatibility','cross-platform certification','full GUI Git URL installation']};
  return {manifest,contract};
}
