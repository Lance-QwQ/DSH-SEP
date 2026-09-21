import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConverter } from '../index.js';

// Rejecting invalid limits prevents accidentally unbounded child execution or IO.
for (const key of ['timeoutMs', 'maxInputBytes', 'maxOutputBytes', 'maxImageResolution', 'maxArchiveEntries', 'maxUncompressedBytes', 'maxFontFiles', 'maxFontFileBytes', 'maxLoadedFontBytes']) {
  test(`reject invalid ${key} before resolving an engine`, async () => {
    for (const value of [0, -1, 1.5, Infinity, '12']) {
      await assert.rejects(createConverter({ [key]: value }), TypeError);
    }
  });
}
test('reject unsupported font controls instead of pretending to apply them', async () => {
  for (const key of ['fontDirectories', 'fontFallbacks', 'initialFontFamilies']) {
    await assert.rejects(createConverter({ [key]: [] }), /not supported/i);
  }
});
test('an absent explicit engine is unavailable, without PATH fallback', async () => {
  await assert.rejects(createConverter({ executablePath: 'C:\\dsh-sep-no-such-engine\\soffice.com' }), error => error.code === 'unavailable');
});
test('executablePath must be absolute', async () => {
  await assert.rejects(createConverter({ executablePath: 'soffice.com' }), TypeError);
});
test('unknown options cannot silently disable or bypass a limit', async () => {
  await assert.rejects(createConverter({ executablePath: process.execPath, unsupportedOption: true }), TypeError);
});
test('custom legacy font limits cannot silently appear enforced', async () => {
  await assert.rejects(createConverter({ executablePath: process.execPath, maxFontFiles: 30000 }), /not supported/i);
});
