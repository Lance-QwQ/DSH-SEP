import { createHash } from 'node:crypto';
import { createSessionFormatCatalog } from '@deepseek-ai/dsh-session-format';
import { KNOWN_SESSION_EVENT_TYPES, Session, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session';
import { releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, sessionFormatV0ToV1 } from './vendor/v0-v1.mjs';
import { releasedV2SessionFormatCodec, sessionFormatV1ToV2 } from './vendor/v1-v2.mjs';
import { releasedV3SessionFormatCodec, sessionFormatV2ToV3, restoreReleasedV3Artifact, assertReleasedV3Header } from './vendor/v2-v3.mjs';
import { validateLocalArtifact } from './extensions.mjs';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function restore(artifact, current) {
  const result = restoreReleasedV3Artifact(artifact, KNOWN_SESSION_EVENT_TYPES);
  validateLocalArtifact(result);
  if (current) Session.fromRestore(SessionId(result.header.id), result.events, result.header, SessionLogOffset(result.inheritedEventCount), 'detached');
  return result;
}
/** Build-static local fork: only two classified SEP extensions are added to the historical catalog. */
export function createLocalSessionFormatCatalog(stages = []) {
  return createSessionFormatCatalog({
    currentVersion: 3,
    codecs: [releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, releasedV2SessionFormatCodec, releasedV3SessionFormatCodec],
    currentEncoder: releasedV3SessionFormatCodec,
    migrations: [sessionFormatV0ToV1, sessionFormatV1ToV2, sessionFormatV2ToV3].map(edge => ({ ...edge, name: '@deepseek-ai/dsh-sep-session-migration/' + edge.fromVersion + '-' + edge.toVersion, createStage(input) { const stage = edge.createStage(input); stages.push({ fromVersion: edge.fromVersion, stage }); return stage; } })),
    restoreCurrent: artifact => restore(artifact, true),
    restoreTransformedCurrent: artifact => restore(artifact, false),
    restoreCurrentHeader(header) { assertReleasedV3Header(header); return header; },
  });
}
/** Migrate an explicitly supplied format-0 artifact without filesystem writes or execution. */
export function migrateLegacyArtifact(physicalHeader, physicalRows) {
  if (physicalHeader?.version !== 0) throw new Error('LOCAL_SOURCE_VERSION: this migration entry accepts format 0 only');
  const detachedHeader = structuredClone(physicalHeader);
  const rows = structuredClone(physicalRows);
  const events = [];
  const context = { emitEvent(event) { events.push(event); }, emitRun(run) { events.push(...run.expand()); } };
  const decoder = releasedV0SessionFormatCodec.createDecoder(detachedHeader, 'strict');
  for (const row of rows) decoder.decodeRow(row, context);
  const inheritedEventCount = decoder.finish(context);
  validateLocalArtifact({ header: decoder.header, events, inheritedEventCount });
  const stages = [];
  const catalog = createLocalSessionFormatCatalog(stages);
  const migration = catalog.createRestore(detachedHeader, { recovery: 'strict', validation: 'current' });
  for (const row of rows) migration.decodeRow(row);
  const artifact = migration.finish();
  const middle = stages.find(item => item.fromVersion === 1).stage.state;
  const last = stages.find(item => item.fromVersion === 2).stage.mapping;
  const mapping = events.map(event => {
    const embedded = middle.sepEmbeddedOrigins.has(event.seq);
    const intermediate = embedded ? middle.sepEmbeddedOrigins.get(event.seq) : middle.mapping.get(event.seq);
    const targetSeq = last[intermediate];
    if (!Number.isSafeInteger(targetSeq)) throw new Error('LOCAL_MAPPING: source event lacks an audited output or stream origin');
    return { sourceSeq: event.seq, sourceType: event.type, sourceSha256: sha(event), targetSeq, targetType: artifact.events[targetSeq].type, disposition: embedded ? 'embedded-stream' : 'event' };
  });
  const owned = new Set(mapping.map(item => item.targetSeq));
  const generated = artifact.events.filter(event => !owned.has(event.seq)).map(event => ({ seq: event.seq, type: event.type, sha256: sha(event) }));
  return { artifact, mapping, generated, sourceSha256: sha({ header: physicalHeader, rows: physicalRows }), targetSha256: sha(artifact), execution: 'none', sourceModified: false };
}
