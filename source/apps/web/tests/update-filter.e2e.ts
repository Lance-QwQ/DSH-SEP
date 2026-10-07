/** Built General Settings with controlled Desktop acknowledgements; no model calls or installation. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold, watchConsole, webSnapshotMode } from './scaffold.ts'
import { openSettings } from './support.ts'

// Mirrors the type-only preload preference API without importing a Client compiler face.
type Strength = 'weak' | 'medium' | 'strong'
interface Preferences { strength: Strength }
interface PreferenceFixture {
  requests: Strength[]
  listeners: Set<(value: Preferences) => void>
  commit(): void
  fail(): void
}
type FixtureWindow = Window & typeof globalThis & { updateFilterFixture: PreferenceFixture }

it('uses the saved update filter in built Chinese General Settings', async () => {
  expect(webSnapshotMode()).toBe('replay')
  const evidenceRoot = process.env.DSH_UPDATE_FILTER_EVIDENCE_DIR ?? join(tmpdir(), 'dsh-update-filter-evidence')
  await mkdir(evidenceRoot, { recursive: true })
  const evidence = await mkdtemp(join(evidenceRoot, 'browser-'))
  const scaffold = await launchWebScaffold()
  try {
    const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
    const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', colorScheme: 'light' })
      const externalRequests: string[] = []
      await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.protocol === 'data:' || ['127.0.0.1', 'localhost'].includes(url.hostname)) await route.continue()
        else { externalRequests.push(url.origin); await route.abort() }
      })
      await page.addInitScript(() => {
        let current: Preferences = { strength: 'strong' }
        let pending: { strength: Strength; resolve(value: Preferences): void; reject(error: Error): void } | undefined
        const listeners = new Set<(value: Preferences) => void>()
        const fixture: PreferenceFixture = {
          requests: [], listeners,
          commit() {
            if (pending === undefined) throw Error('No pending preference save')
            current = { strength: pending.strength }
            for (const listener of listeners) listener(current)
            pending.resolve(current)
            pending = undefined
          },
          fail() {
            if (pending === undefined) throw Error('No pending preference save')
            pending.reject(Error('Controlled save failure'))
            pending = undefined
          },
        }
        Object.assign(window, {
          updateFilterFixture: fixture,
          dshDesktop: { protocolVersion: 1, updatePreferences: {
            get: async () => current,
            set(strength: Strength) {
              fixture.requests.push(strength)
              return new Promise<Preferences>((resolve, reject) => { pending = { strength, resolve, reject } })
            },
            subscribe(listener: (value: Preferences) => void) { listeners.add(listener); return () => listeners.delete(listener) },
          } },
        })
      })
      const tripwire = watchConsole(page)
      try {
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        await page.waitForSelector('[class*="frame"]')
        await openSettings(page, 'zh')
        const settings = page.getByRole('dialog', { name: '设置', exact: true })
        await settings.getByRole('button', { name: '通用设置', exact: true }).click()
        const tabs = settings.getByRole('tablist', { name: '更新过滤强度', exact: true })
        await tabs.waitFor()
        await tabs.locator('..').scrollIntoViewIfNeeded()
        expect(await tabs.getByRole('tab').allTextContents()).toEqual(['弱', '中', '强'])
        const weak = tabs.getByRole('tab', { name: '弱', exact: true })
        const medium = tabs.getByRole('tab', { name: '中', exact: true })
        const strong = tabs.getByRole('tab', { name: '强', exact: true })
        const selected = async () => tabs.locator('[aria-selected="true"]').textContent()
        await expect.poll(selected).toBe('强')
        expect(await settings.getByRole('tabpanel').textContent()).toBe('接收 RC、正式版（默认）')
        expect(await settings.getByText('同时用于 DSH 和 SEP 更新发现。仅接收高于当前版本的更新；不会自动安装，也不会降级。保存后立即重新检查。', { exact: true }).isVisible()).toBe(true)
        await page.screenshot({ path: join(evidence, 'strong-light.png') })

        await weak.click()
        await expect.poll(() => page.evaluate(() => (window as FixtureWindow).updateFilterFixture.requests)).toEqual(['weak'])
        expect(await selected()).toBe('强')
        expect(await medium.isDisabled()).toBe(true)
        await page.evaluate(() => (window as FixtureWindow).updateFilterFixture.commit())
        await expect.poll(selected).toBe('弱')
        expect(await settings.getByRole('tabpanel').textContent()).toBe('接收 Alpha、Beta、RC、正式版')
        await page.screenshot({ path: join(evidence, 'weak-saved.png') })

        await medium.click()
        await expect.poll(() => page.evaluate(() => (window as FixtureWindow).updateFilterFixture.requests)).toEqual(['weak', 'medium'])
        await page.evaluate(() => (window as FixtureWindow).updateFilterFixture.fail())
        await settings.getByRole('alert').waitFor()
        expect(await settings.getByRole('alert').textContent()).toBe('保存失败，原设置仍然有效，请重试')
        expect(await selected()).toBe('弱')
        expect(await medium.isEnabled()).toBe(true)
        await page.screenshot({ path: join(evidence, 'save-failed.png') })

        await medium.click()
        await page.evaluate(() => (window as FixtureWindow).updateFilterFixture.commit())
        await expect.poll(selected).toBe('中')
        expect(await settings.getByRole('alert').count()).toBe(0)
        expect(await settings.getByRole('tabpanel').textContent()).toBe('接收 Beta、RC、正式版')
        await strong.click()
        await page.evaluate(() => (window as FixtureWindow).updateFilterFixture.commit())
        await expect.poll(selected).toBe('强')
        await page.emulateMedia({ colorScheme: 'dark' })
        await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(true)
        await page.screenshot({ path: join(evidence, 'strong-dark.png') })
        expect(tripwire.pageErrors).toEqual([])
        expect(tripwire.warnings).toEqual([])
        expect(externalRequests).toEqual([])
        await writeFile(join(evidence, 'result.json'), JSON.stringify({ passed: true, locale: 'zh-CN',
          browser: await browser.version(), host: 'real Web composition', desktopCarrier: 'controlled',
          checks: ['default-strong', 'three-strengths', 'wait-for-save', 'save-failure-retains-value', 'retry', 'light-and-dark'],
          electron: false, installerExecuted: false, modelCalls: false, externalBrowserRequests: externalRequests }, null, 2) + '\n')
        console.log(`Update filter browser evidence: ${evidence}`)
      } catch (error) {
        await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => undefined)
        await writeFile(join(evidence, 'failure.json'), JSON.stringify({ pageErrors: tripwire.pageErrors,
          warnings: tripwire.warnings, externalBrowserRequests: externalRequests }, null, 2) + '\n')
        throw error
      }
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
