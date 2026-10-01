/** Optional Electron status presentation; the native shell owns actions and Web owns visible copy. */
import { IconDownloadOutlineRegular, IconLoadingOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DesktopUpdateView as UpdateView } from '../types.ts'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DesktopUpdateIndicator.module.css'
import type { DesktopUpdateFailureKind, DesktopUpdatePresentation, DesktopUpdateView } from '../types.ts'
import type { SettingsRootInjected } from './shell-contract.ts'

type SettingsTranslate = PropsLocale<'settings'>['t']

const BUSY_PHASES: ReadonlySet<DesktopUpdatePresentation['phase']> = new Set([
  'checking', 'downloading', 'verifying', 'installing',
])

function updateCopy(state: DesktopUpdatePresentation, t: SettingsTranslate): { label: string; detail: string } {
  const labels: Readonly<Record<DesktopUpdatePresentation['phase'], string>> = {
    idle: '',
    checking: t('desktop.update.checking'),
    available: t('desktop.update.available'),
    downloading: t('desktop.update.progress', { percent: state.percent ?? 0 }),
    verifying: t('desktop.update.verifying'),
    installing: t('desktop.update.installing'),
    ready: t('desktop.update.ready'),
    error: t('desktop.update.retry'),
  }
  const label = labels[state.phase]
  if (state.phase === 'checking' || state.phase === 'verifying' || state.phase === 'installing') {
    return { label, detail: state.version ?? label }
  }
  if (state.phase === 'error') {
    const failures: Readonly<Record<DesktopUpdateFailureKind, string>> = {
      check: t('desktop.update.checkFailed'),
      'check-network': t('desktop.update.checkNetworkFailed'),
      download: t('desktop.update.downloadFailed'),
      'download-network': t('desktop.update.downloadNetworkFailed'),
      install: t('desktop.update.installFailed'),
      'install-network': t('desktop.update.installNetworkFailed'),
      'stop-failed': t('desktop.update.stopFailed'),
      'tasks-changed': t('desktop.update.tasksChanged'),
      'tasks-unavailable': t('desktop.update.tasksUnavailable'),
    }
    return { label, detail: failures[state.failure ?? 'install'] }
  }
  if (state.phase === 'downloading' && state.version !== undefined) {
    return { label, detail: t('desktop.update.downloadDetail', { percent: state.percent ?? 0, version: state.version }) }
  }
  return { label, detail: state.version === undefined
    ? label
    : t('desktop.update.versionDetail', { label, version: state.version }) }
}

/**
 * Render update status with connection-indicator geometry and brand-blue labels, including retries.
 * @param props - Connection priority, sidebar width, and localized bridge-failure copy.
 * @returns Desktop-only status beside the account button, or nothing in browsers.
 */
export function DesktopUpdateIndicator({ wide, hidden, t, view, onOpen, product }: {
  product?: 'DSH' | 'SEP'
  wide: boolean
  hidden: boolean
  t: SettingsTranslate
  view: DesktopUpdateView
  onOpen: () => void
}) {
  const { presentation: state, failed, opening } = view
  if (!wide || hidden || (!failed && (state === undefined || state.phase === 'idle'))) return null
  const retryLabel = t('desktop.update.retry')
  const copy = state === undefined ? { label: retryLabel, detail: retryLabel } : updateCopy(state, t)
  const statusLabel = failed ? retryLabel : copy.label
  const label = product === undefined ? statusLabel : t('desktop.update.productStatus', { product, status: statusLabel })
  const error = failed || state?.phase === 'error'
  const busy = opening || (state !== undefined && BUSY_PHASES.has(state.phase))
  return <Tooltip label={failed ? retryLabel : copy.detail} side="top">
    <button type="button" className={css.indicator}
      aria-label={label} aria-disabled={busy} onClick={() => { if (!busy) onOpen() }}>
      <span className={css.icon} aria-hidden="true">
        {error ? <span className={css.errorDot} />
          : busy ? <IconLoadingOutlineRegular className={css.spinner} size={14} /> : <IconDownloadOutlineRegular size={14} />}
      </span>
      <span>{label}</span>
    </button>
  </Tooltip>
}

/** SEP and host updates share geometry but retain independent state and actions. */
export function DesktopUpdateIndicators({ wide, hidden, t, host, sep, onHost, onSep }: {
  wide: boolean; hidden: boolean; t: SettingsTranslate; host: UpdateView; sep: UpdateView
  onHost: () => void; onSep: () => void
}) {
  return <div className={css.stack}>
    <DesktopUpdateIndicator wide={wide} hidden={hidden && sep.presentation?.phase !== 'installing'}
      product="SEP" t={t} view={sep} onOpen={onSep} />
    <DesktopUpdateIndicator wide={wide} hidden={hidden && host.presentation?.phase !== 'installing'}
      product="DSH" t={t} view={host} onOpen={onHost} />
  </div>
}

type BadgeProps = PropsRuntime<'sidebar.toggle.badge'> & PropsLocale<'settings'>
  & Pick<InjectFace<SettingsRootInjected>, 'useDesktopUpdate' | 'useSepUpdate' | 'useConnectionState'>

/**
 * @param props - Framework-bound carrier and connection state.
 * @returns A non-interactive brand-blue notification on the sidebar expand button.
 */
export function DesktopUpdateBadge({ useDesktopUpdate, useSepUpdate, useConnectionState, t }: BadgeProps) {
  const host = useDesktopUpdate(value => value)
  const sep = useSepUpdate(value => value)
  const connection = useConnectionState(value => value)
  const labels = ([['SEP', sep], ['DSH', host]] as const).flatMap(([product, view]) => {
    const state = view.presentation
    if (((connection === 'disconnected' || connection === 'connecting') && state?.phase !== 'installing')
      || (!view.failed && (state === undefined || state.phase === 'idle'))) return []
    const status = view.failed || state === undefined ? t('desktop.update.retry') : updateCopy(state, t).label
    return [t('desktop.update.productStatus', { product, status })]
  })
  if (labels.length === 0) return null
  const label = labels.join(' / ')
  return <Tooltip label={label} side="right">
    <span role="img" aria-label={label} className={css.badge} />
  </Tooltip>
}
