/** General Settings filter shared by managed DSH and SEP update discovery. */
import { useId } from 'react'
import { Button, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UpdateFilterStrength } from '../types.ts'
import type { DesktopUpdatePreferencesView } from './desktop-update-preferences-source.ts'
import css from './UpdateFilterRow.module.css'

/** Accepted preference and carrier actions supplied by the Desktop owner. */
export interface UpdateFilterRowInjected {
  hooks: { updatePreferences: ObservableSnapshot<DesktopUpdatePreferencesView> }
  setStrength(strength: UpdateFilterStrength): void
  reload(): void
}

/**
 * Render the managed update discovery preference.
 * @param props - Accepted preferences, mutation callbacks and localized copy.
 * @returns The preference row, or nothing when the carrier does not support it.
 */
export function UpdateFilterRow({ useUpdatePreferences, setStrength, reload, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<UpdateFilterRowInjected>) {
  const state = useUpdatePreferences(value => value)
  const id = useId()
  if (state.preferences === null || (state.preferences === undefined && !state.failed)) return null
  const strength = state.preferences?.strength
  return <div className={css.row}>
    <div className={css.title}>{t('updateFilter.title')}</div>
    <div className={css.description}>{t('updateFilter.description')}</div>
    {strength === undefined ? <>
      <div role="alert" className={css.description}>{t('updateFilter.loadFailed')}</div>
      <Button onClick={reload}>{t('updateFilter.retry')}</Button>
    </> : <>
      <SegmentedControl id={id} value={strength} label={t('updateFilter.title')} disabled={state.saving}
        options={[
          { value: 'weak', label: t('updateFilter.weak'), title: t('updateFilter.weakDetail') },
          { value: 'medium', label: t('updateFilter.medium'), title: t('updateFilter.mediumDetail') },
          { value: 'strong', label: t('updateFilter.strong'), title: t('updateFilter.strongDetail') },
        ]} onChange={setStrength} />
      <div id={`${id}-${strength}-panel`} role="tabpanel" aria-labelledby={`${id}-${strength}`} className={css.description}>
        {t(strength === 'weak' ? 'updateFilter.weakDetail' : strength === 'medium' ? 'updateFilter.mediumDetail' : 'updateFilter.strongDetail')}
      </div>
      <div className={css.feedback} aria-live="polite">
        {state.failed ? <span role="alert">{t('updateFilter.saveFailed')}</span> : null}
      </div>
    </>}
  </div>
}
