// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-format-catalog/src/generated.ts
import { KNOWN_SESSION_EVENT_TYPES } from "@deepseek-ai/dsh-session";
import { createSessionFormatCatalog } from "@deepseek-ai/dsh-session-format";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-format-catalog/src/current.ts
import {
  SESSION_FORMAT_VERSION,
  Session,
  SessionId,
  SessionLogOffset
} from "@deepseek-ai/dsh-session";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-format-catalog/src/message-projections.ts
import { imageOffloadProjection } from "@deepseek-ai/dsh-compaction-image-offload/projection";
var currentSessionMessageProjections = [imageOffloadProjection];

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-format-catalog/src/current.ts
function validateInstalledCurrentSessionHeader(header) {
  if (header.version !== SESSION_FORMAT_VERSION) {
    throw new Error(
      `installed Session format is v${SESSION_FORMAT_VERSION}, got v${header.version}`
    );
  }
  Session.fromRestore(
    SessionId(header.id),
    [],
    header,
    SessionLogOffset(0),
    "detached"
  );
}
function validateInstalledCurrentSessionArtifact(artifact) {
  if (artifact.header.version !== SESSION_FORMAT_VERSION) {
    throw new Error(
      `installed Session format is v${SESSION_FORMAT_VERSION}, got v${artifact.header.version}`
    );
  }
  Session.fromRestore(
    SessionId(artifact.header.id),
    artifact.events,
    artifact.header,
    SessionLogOffset(artifact.inheritedEventCount),
    "detached",
    currentSessionMessageProjections
  );
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-format-catalog/src/generated.ts
import { releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, sessionFormatV0ToV1 } from "@deepseek-ai/dsh-session-format-v0-to-v1";
import { releasedV2SessionFormatCodec, sessionFormatV1ToV2 } from "@deepseek-ai/dsh-session-format-v1-to-v2";
import { assertReleasedV3Header, releasedV3SessionFormatCodec, restoreReleasedV3Artifact, sessionFormatV2ToV3 } from "@deepseek-ai/dsh-session-format-v2-to-v3";
var sessionFormatCatalog = createSessionFormatCatalog({
  currentVersion: 3,
  codecs: [releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, releasedV2SessionFormatCodec, releasedV3SessionFormatCodec],
  currentEncoder: releasedV3SessionFormatCodec,
  migrations: [sessionFormatV0ToV1, sessionFormatV1ToV2, sessionFormatV2ToV3],
  restoreCurrent(artifact) {
    const restored = restoreReleasedV3Artifact(artifact, KNOWN_SESSION_EVENT_TYPES);
    validateInstalledCurrentSessionArtifact(restored);
    return restored;
  },
  restoreTransformedCurrent(artifact) {
    return restoreReleasedV3Artifact(artifact, KNOWN_SESSION_EVENT_TYPES);
  },
  restoreCurrentHeader(header) {
    assertReleasedV3Header(header);
    validateInstalledCurrentSessionHeader(header);
    return header;
  }
});

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-format-catalog/src/local-admission.ts
import { foldTasks } from "@deepseek-ai/dsh-task-checkpoint/fold";
function withLocalTaskAdmission(catalog) {
  return Object.freeze({
    ...catalog,
    createRestore(header, options) {
      const restore = catalog.createRestore(header, options);
      return {
        header: restore.header,
        decodeRow(row) {
          restore.decodeRow(row);
        },
        finish() {
          const artifact = restore.finish();
          foldTasks(artifact.events, Number.MAX_SAFE_INTEGER);
          return artifact;
        }
      };
    }
  });
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-format-catalog/src/index.ts
import { SessionFormatUnsupportedMigrationError } from "@deepseek-ai/dsh-session-format";
var sessionFormatCatalog2 = withLocalTaskAdmission(sessionFormatCatalog);
export {
  SessionFormatUnsupportedMigrationError,
  sessionFormatCatalog2 as sessionFormatCatalog
};
//# sourceMappingURL=index.js.map
