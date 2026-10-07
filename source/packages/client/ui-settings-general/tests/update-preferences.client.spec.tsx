// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { DesktopUpdatePreferencesSource } from '../src/client/desktop-update-preferences-source.ts'
import { UpdateFilterRow } from '../src/client/UpdateFilterRow.tsx'
import type { DesktopUpdatePreferences, DesktopUpdatePreferencesBridge, UpdateFilterStrength } from '../src/types.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

function fixture(bridgeAvailable = true) {
  let listener: ((value: DesktopUpdatePreferences) => void) | undefined
  const loaded = Promise.withResolvers<DesktopUpdatePreferences | null>()
  let save = Promise.withResolvers<DesktopUpdatePreferences>()
  const requested: UpdateFilterStrength[] = []
  const unsubscribe = vi.fn()
  const bridge: DesktopUpdatePreferencesBridge = {
    get: () => loaded.promise,
    set: strength => { requested.push(strength); return save.promise },
    subscribe: callback => { listener = callback; return unsubscribe },
  }
  const source = new DesktopUpdatePreferencesSource(bridgeAvailable ? bridge : undefined)
  const subscribe = (notify: () => void) => source.store.subscribe(notify)
  type RowProps = Parameters<typeof UpdateFilterRow>[0]
  const unused = (() => { throw Error('unused standard hook') }) as never
  function Row({ dictionary = zh }: { dictionary?: typeof zh | typeof en }) {
    const t: PropsLocale<'settings'>['t'] = key => (dictionary as Record<string, string>)[key] ?? key
    return <UpdateFilterRow t={t} useSessions={unused} useSessionStatus={unused} usePanelInfo={unused}
      useSessionRetainInfo={unused} useResource={unused} useWorkspaces={unused}
      useUpdatePreferences={((select) => select(useSyncExternalStore(subscribe, source.store.getSnapshot))) as RowProps['useUpdatePreferences']}
      setStrength={strength => { source.set(strength) }} reload={() => { source.reload() }} />
  }
  const view = render(<Row />)
  return { source, view, Row, loaded, requested, unsubscribe,
    save: () => save,
    nextSave: () => { save = Promise.withResolvers<DesktopUpdatePreferences>(); return save },
    emit: async (value: DesktopUpdatePreferences) => { await act(async () => { listener?.(value) }) },
    close: () => { source.dispose(); view.unmount() },
  }
}

it('hides the filter in browsers and on unmanaged desktop carriers', async () => {
  for (const available of [false, true]) {
    const f = fixture(available)
    await act(async () => { f.loaded.resolve(null) })
    expect(f.view.container.textContent).toBe('')
    f.close()
  }
})

it('shows the accepted strength and changes it only after the desktop saves', async () => {
  const f = fixture()
  try {
    await act(async () => { f.loaded.resolve({ strength: 'strong' }) })
    expect(screen.getByRole('tab', { name: '强' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toBe('接收 RC、正式版（默认）')
    expect(f.view.container.textContent).toMatchInlineSnapshot('"更新过滤强度同时用于 DSH 和 SEP 更新发现。仅接收高于当前版本的更新；不会自动安装，也不会降级。保存后立即重新检查。弱中强接收 RC、正式版（默认）"')
    fireEvent.click(screen.getByRole('tab', { name: '弱' }))
    expect(f.requested).toEqual(['weak'])
    expect(screen.getByRole('tab', { name: '强' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: '中' }).hasAttribute('disabled')).toBe(true)
    await act(async () => { f.save().resolve({ strength: 'weak' }) })
    expect(screen.getByRole('tab', { name: '弱' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toBe('接收 Alpha、Beta、RC、正式版')
    f.view.rerender(<f.Row dictionary={en} />)
    expect(screen.getByRole('tablist', { name: 'Update filter strength' })).toBeTruthy()
    expect(screen.getByRole('tabpanel').textContent).toBe('Receive Alpha, Beta, RC, and stable releases')
  } finally { f.close() }
  expect(f.unsubscribe).toHaveBeenCalledOnce()
})

it('retains the saved strength after failure and allows a new attempt', async () => {
  const f = fixture()
  try {
    await act(async () => { f.loaded.resolve({ strength: 'strong' }) })
    fireEvent.click(screen.getByRole('tab', { name: '弱' }))
    await act(async () => { f.save().reject(Error('disk full')) })
    expect(screen.getByRole('alert').textContent).toBe('保存失败，原设置仍然有效，请重试')
    expect(screen.getByRole('tab', { name: '强' }).getAttribute('aria-selected')).toBe('true')
    const retried = f.nextSave()
    fireEvent.click(screen.getByRole('tab', { name: '中' }))
    await act(async () => { retried.resolve({ strength: 'medium' }) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('tabpanel').textContent).toBe('接收 Beta、RC、正式版')
  } finally { f.close() }
})

it('keeps newer desktop events over initial and save responses', async () => {
  const f = fixture()
  try {
    await f.emit({ strength: 'medium' })
    await act(async () => { f.loaded.resolve({ strength: 'strong' }) })
    expect(screen.getByRole('tab', { name: '中' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: '弱' }))
    await f.emit({ strength: 'strong' })
    await act(async () => { f.save().resolve({ strength: 'weak' }) })
    expect(screen.getByRole('tab', { name: '强' }).getAttribute('aria-selected')).toBe('true')
    const before = f.source.store.getSnapshot()
    f.source.dispose()
    await f.emit({ strength: 'weak' })
    expect(f.source.store.getSnapshot()).toBe(before)
  } finally { f.close() }
})
