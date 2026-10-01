import { migrateLegacyArtifact } from '../src/index.mjs';

const result = migrateLegacyArtifact({ version: 0 }, []);
const execution: 'none' = result.execution;
const modified: false = result.sourceModified;
const sourceHash: string = result.sourceSha256;
const targetVersion: number = result.artifact.header.version;
for (const row of result.mapping) {
  const disposition: 'embedded-stream' | 'event' = row.disposition;
  const sequence: number = row.targetSeq;
  void [disposition, sequence];
}
for (const row of result.generated) {
  const digest: string = row.sha256;
  void digest;
}
void [execution, modified, sourceHash, targetVersion];
