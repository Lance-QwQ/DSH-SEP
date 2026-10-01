// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { AssessmentSettingsSection } from '../src/client/AssessmentSettingsSection.tsx';
import type { AssessmentApi, AssessmentView } from '../src/client/assessment-api.ts';
import { en } from '../src/client/assessment-locales.ts';
import css from '../src/client/AssessmentSettingsSection.module.css';

// jsdom verifies applied CSS and retained text; native Desktop owns actual overflow measurements.
test('long model summaries and target fields retain their text inside wrapping-enabled containers', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const longText = 'verylongword'.repeat(30);
  const state: AssessmentView = {
    version: 1, available: true, enabled: false,
    latest: { target: longText, status: 'blocked', phase: 'interrupted', analysis: 'pass', review: 'fail', summary: longText, reason: 'ASSESSMENT_REDISCOVERY_REQUIRED', plugins: [] },
    usage: null,
  };
  const api: AssessmentApi = { get: async () => state, update: async () => state, retry: async () => state };
  const style = document.createElement('style');
  style.textContent = readFileSync(new NodeURL('../src/client/AssessmentSettingsSection.module.css', import.meta.url), 'utf8').replace(/\.(section|heading|switch)\b/gu, (_, name: string) => '.' + css[name]);
  document.head.append(style);
  const div = document.createElement('div'); document.body.append(div); const root = createRoot(div);
  try {
    await act(async () => { root.render(createElement(AssessmentSettingsSection, { api, requestTimeoutMs: 1000, useConnection: select => select(0), t: key => en[key] })); });
    const section = div.querySelector('section')!;
    const details = div.querySelector('details')!; details.open = true;
    const summary = [...details.querySelectorAll('p')].find(p => p.textContent === longText)!;
    const target = div.querySelector('dd')!;
    expect(summary.textContent).toBe(longText);
    expect(target.textContent).toBe(longText);
    expect.soft(getComputedStyle(section).minWidth).toMatch(/^0(?:px)?$/u);
    expect.soft(getComputedStyle(details).minWidth).toMatch(/^0(?:px)?$/u);
    expect.soft(getComputedStyle(summary).overflowWrap).toBe('anywhere');
    expect.soft(getComputedStyle(target).overflowWrap).toBe('anywhere');
  } finally { await act(async () => root.unmount()); div.remove(); style.remove(); vi.unstubAllGlobals(); }
});
