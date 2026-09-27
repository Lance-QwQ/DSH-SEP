import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type { MemoryControls, MemoryProjectList, MemorySettingsApi, MemorySnapshot } from '../protocol.ts';
import type { MemoryLocaleKey } from './locales.ts';
import css from './MemorySettingsSection.module.css';

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'settings.sepMemory': MemoryLocaleKey } }

/** Registration-owned transport callbacks and connection generation invalidation. */
export interface MemorySettingsSectionInjected {
  readonly api: MemorySettingsApi;
  readonly requestTimeoutMs: number;
  readonly hooks: { readonly connection: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } };
}
/** Native Settings section's derived owner, locale and injected props. */
export type MemorySettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.sepMemory'> & InjectFace<MemorySettingsSectionInjected>;
type View = { snapshot: MemorySnapshot | null; loading: boolean; saving: boolean; message: 'readError' | 'unconfirmed' | 'conflict' | null };

/** Project-scoped controls display the last confirmed Host state until save settles. */
export function MemorySettingsSection({ api, requestTimeoutMs, useConnection, t }: MemorySettingsSectionProps): ReactNode {
  const controlId = useId();
  const connection = useConnection(value => value);
  const [catalog, setCatalog] = useState<MemoryProjectList | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);
  const [view, setView] = useState<View>({ snapshot: null, loading: true, saving: false, message: null });
  const active = useRef<AbortController | null>(null);
  const pendingWrite = useRef(false);
  const reloadAfterWrite = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.abort(); };
  }, []);
  useEffect(() => {
    if (pendingWrite.current) { reloadAfterWrite.current = true; return; }
    const controller = new AbortController();
    setCatalogError(false);
    void request(signal => api.list(signal), controller.signal, requestTimeoutMs).then(
      value => {
        if (controller.signal.aborted) return;
        if (pendingWrite.current) { reloadAfterWrite.current = true; return; }
        setCatalog(value); setProjectId(previous => value.projects.some(project => project.id === previous) ? previous : value.projects[0]?.id ?? '');
      },
      () => {
        if (controller.signal.aborted) return;
        if (pendingWrite.current) { reloadAfterWrite.current = true; return; }
        setCatalogError(true); setCatalog(null);
      },
    );
    return () => controller.abort();
  }, [api, connection, refresh, requestTimeoutMs]);
  useEffect(() => {
    if (!catalog?.available || projectId === '' || pendingWrite.current) return;
    const controller = new AbortController();
    active.current?.abort(); active.current = controller;
    setView({ snapshot: null, loading: true, saving: false, message: null });
    void request(signal => api.get(projectId, signal), controller.signal, requestTimeoutMs).then(
      snapshot => { if (!controller.signal.aborted) { setConfirmedAt(Date.now()); setView({ snapshot, loading: false, saving: false, message: null }); } },
      () => { if (!controller.signal.aborted) setView({ snapshot: null, loading: false, saving: false, message: 'readError' }); },
    );
    return () => controller.abort();
  }, [api, catalog, projectId, requestTimeoutMs]);

  const save = async (controls: MemoryControls): Promise<void> => {
    if (pendingWrite.current || view.snapshot === null || view.loading) return;
    const expected = view.snapshot.controls;
    pendingWrite.current = true;
    const controller = new AbortController(); active.current?.abort(); active.current = controller;
    setView(previous => ({ ...previous, saving: true, message: null }));
    try {
      const snapshot = await request(signal => api.update(projectId, expected, controls, signal), controller.signal, requestTimeoutMs);
      if (mounted.current && !controller.signal.aborted && !reloadAfterWrite.current) { setConfirmedAt(Date.now()); setView({ snapshot, loading: false, saving: false, message: null }); }
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      const message = error instanceof Error && error.message === 'MEMORY_SETTINGS_CONFLICT' ? 'conflict' : 'unconfirmed';
      setView(previous => ({ ...previous, saving: true, message }));
      if (reloadAfterWrite.current) return;
      try {
        const snapshot = await request(signal => api.get(projectId, signal), controller.signal, requestTimeoutMs);
        if (mounted.current && !controller.signal.aborted && !reloadAfterWrite.current) { setConfirmedAt(Date.now()); setView({ snapshot, loading: false, saving: false, message }); }
      } catch {
        // An unavailable read cannot establish whether the preceding write committed.
        if (mounted.current && !controller.signal.aborted) setView({ snapshot: null, loading: false, saving: false, message });
      }
    } finally {
      pendingWrite.current = false;
      if (mounted.current && reloadAfterWrite.current) {
        reloadAfterWrite.current = false;
        setView(previous => ({ ...previous, snapshot: null, loading: true, saving: false }));
        setRefresh(value => value + 1);
      }
    }
  };
  const snapshot = view.snapshot;
  const project = catalog?.projects.find(value => value.id === projectId);
  const unavailable = catalog !== null && (!catalog.available || catalog.projects.length === 0);
  const busy = view.loading || view.saving;
  const state = (key: 'capture' | 'recall'): MemoryLocaleKey => {
    if (!snapshot?.controls[key]) return 'paused';
    if (!snapshot.configured[key]) return 'capped';
    return snapshot.effective[key] ? 'effective' : 'ineffective';
  };
  return <section className={css.section} aria-labelledby={`${controlId}-title`} aria-busy={busy}>
    <div className={css.heading}><h2 id={`${controlId}-title`}>{t('title')}</h2><button type="button" disabled={view.saving} onClick={() => setRefresh(value => value + 1)}>{t('refresh')}</button></div>
    <p className={css.description}>{t('scope')}</p>
    {catalogError || unavailable ? <p role="alert" className={css.error}>{t(catalogError ? 'readError' : 'unavailable')}</p> : null}
    {catalog !== null && catalog.projects.length > 0 ? <div className={css.project}>
      <label htmlFor={`${controlId}-project`}>{t('project')}</label>
      <select id={`${controlId}-project`} value={projectId} disabled={view.saving} onChange={event => setProjectId(event.currentTarget.value)}>{catalog.projects.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select>
      {project ? <code>{project.root}</code> : null}
    </div> : null}
    {!catalogError && !unavailable && view.loading ? <p role="status">{t('loading')}</p> : null}
    {view.message ? <p role="alert" className={css.error}>{t(view.message)}</p> : null}
    {snapshot !== null && !catalogError && !unavailable ? <>
      <label className={css.master}><span>{t('master')}</span><input type="checkbox" role="switch" aria-label={t('master')} checked={snapshot.controls.capture || snapshot.controls.recall} disabled={busy} onChange={event => { const enabled = event.currentTarget.checked; void save({ capture: enabled, recall: enabled }); }} /></label>
      <p className={css.description}>{t('masterHelp')}</p>
      <div className={css.controls}>{(['capture', 'recall'] as const).map(key => <div className={css.row} key={key}>
        <label><span>{t(key)}</span><input type="checkbox" role="switch" aria-label={t(key)} checked={snapshot.controls[key]} disabled={busy} onChange={event => void save({ ...snapshot.controls, [key]: event.currentTarget.checked })} /></label>
        <small>{t('stored')}: {t(snapshot.controls[key] ? 'on' : 'off')} · {t(state(key))}</small>
      </div>)}</div>
      {view.saving ? <p role="status">{t('saving')}</p> : <p className={css.description}>{t('freshness')}</p>}
      {confirmedAt !== null ? <p className={css.description}>{t('readAt')}: <time dateTime={new Date(confirmedAt).toISOString()}>{new Date(confirmedAt).toLocaleString()}</time></p> : null}
      {snapshot.runtime.state === 'degraded' || snapshot.runtime.state === 'unavailable' ? <p className={css.error} role="status">{t('runtimeUnavailable')}{snapshot.runtime.lastError ? <code>{snapshot.runtime.lastError}</code> : null}</p> : null}
    </> : null}
    <p className={css.notice}>{t('noDelete')}</p>
  </section>;
}
/** Deadline cancellation never retries a mutation; callers re-read after uncertain results. */
async function request<T>(operation: (signal: AbortSignal) => Promise<T>, parent: AbortSignal, timeoutMs: number): Promise<T> {
  const timeout = new AbortController();
  const signal = AbortSignal.any([parent, timeout.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error('MEMORY_SETTINGS_UNCONFIRMED'));
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => timeout.abort(), timeoutMs);
    });
    return await Promise.race([operation(signal), cancelled]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort !== undefined) signal.removeEventListener('abort', abort);
  }
}
