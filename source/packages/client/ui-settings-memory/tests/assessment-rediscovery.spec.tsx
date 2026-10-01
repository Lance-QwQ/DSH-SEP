// @vitest-environment jsdom
import expected from './expected/assessment-rediscovery.expected.json';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { AssessmentSettingsSection } from '../src/client/AssessmentSettingsSection.tsx';
import type { AssessmentApi, AssessmentView } from '../src/client/assessment-api.ts';
import { en, zh } from '../src/client/assessment-locales.ts';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

for (const [language, locale] of [['en', en], ['zh', zh]] as const) {
  test(`${language}: an old report without discovery evidence directs the user to check updates and retains its results`, async () => {
    const view: AssessmentView = {
      version: 1, available: true, enabled: true,
      latest: { target: '0.2.1', status: 'blocked', phase: 'interrupted', analysis: 'pass', review: 'fail', summary: 'Retained analysis and review', reason: 'ASSESSMENT_REDISCOVERY_REQUIRED', plugins: [] },
      usage: { reportedRequests: 2, promptTokens: 200, completionTokens: 40, estimatedCny: 0.001, reservedCny: 0, isProviderInvoice: false },
    };
    let retries = 0;
    const api: AssessmentApi = { get: async () => view, update: async () => view, retry: async () => { retries++; return view; } };
    const div = document.createElement('div'); document.body.append(div); const root = createRoot(div);
    try {
      await act(async () => { root.render(createElement(AssessmentSettingsSection, { api, requestTimeoutMs: 1000, useConnection: () => 0, t: key => locale[key] })); });
      const retry = [...div.querySelectorAll('button')].find(button => button.textContent === locale.retry)!;
      const expectedView = expected[language];
      const visibleNotice = [...div.querySelectorAll('p')].find(p => !p.closest('details') && p.textContent === expectedView.notice)?.textContent;
      const fields = [...div.querySelectorAll('dd')].map(node => node.textContent);
      expect({ notice: visibleNotice, retryDisabled: retry.disabled, analysis: fields[1], review: fields[2], inputTokens: fields[3], outputTokens: fields[4] }).toEqual(expectedView);
      await act(async () => { retry.click(); });
      expect(retries).toBe(0);
      expect(div.textContent).toContain('Retained analysis and review');
      expect((div.querySelector('[role=switch]') as HTMLInputElement).checked).toBe(true);
    } finally { await act(async () => root.unmount()); div.remove(); }
  });
}
