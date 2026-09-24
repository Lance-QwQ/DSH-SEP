import {fatalPayload} from "./startup-diagnostic.mjs"
import {createHostLifecycle} from './sep-host-lifecycle.mjs'
/** Launch the Desktop profile through the Web application and report its URL to Electron. */

import { delimiter, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { loadLayeredEnv, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import * as desktopOffice from './office.ts'

import { installDesktopUpdateTaskControl } from './update-tasks.ts'
import { installSepPluginPolicy } from './plugin-policy.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { sepDesktopTransport: { kind: 'sep-owned-http'; generation: number } }
}

async function main(): Promise<void> {
  const runtimeDir = process.argv[2] as string
  const projectDir = process.argv[3] as string
  const installAnchor = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const nonce = process.env.DSH_SEP_HOST_NONCE
  const generation = Number(process.env.DSH_SEP_HOST_GENERATION)
  const managed = nonce !== undefined || process.env.DSH_SEP_HOST_GENERATION !== undefined
  if (managed && (!/^[a-f0-9]{64}$/u.test(nonce ?? '') || !Number.isSafeInteger(generation) || generation < 1)) {
    throw new Error('SEP_HOST_IDENTITY_INVALID')
  }
  const lifetime = createHostLifecycle({managed})
  try {
  const version = (JSON.parse(await readFile(installAnchor, 'utf8')) as { version?: unknown }).version
  if (managed && version !== '0.1.6-alpha.2') throw new Error('SEP_HOST_VERSION_INVALID')
  const profile = loadProfileDirectory('dsh', projectDir, installAnchor)
  const application = lifetime.startApplication(() => runProfile({
    environment: loadLayeredEnv('dsh'),
    profile: 'desktop',
    resolutionMode: process.argv[5] === 'runtime' ? 'runtime' : 'link',
    resolvedProfile: { profile, installAnchor },
    patchFiles: managed ? [fileURLToPath(new URL('./sep-policy.json', import.meta.url))] : [],
    args: ['--no-open', '--port', managed ? '0' : '19387'],
    ...(process.argv[6] === undefined ? {} : {
      packageManager: {
        command: process.execPath,
        args: ['--expose-internals', process.argv[6]],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
          PATH: `${process.argv[7] ?? ''}${delimiter}${process.env.PATH ?? ''}`,
        },
      },
    }),
  }))
  const control: { updateTasks?: ReturnType<typeof installDesktopUpdateTaskControl> } = {}
  const send = lifetime.send
  process.on('message', (message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return
    if (message.type !== 'update-tasks' || !('requestId' in message) || !Number.isSafeInteger(message.requestId)
      || !('action' in message) || !['inspect', 'lock', 'unlock'].includes(String(message.action))) return
    void (async () => {
      try {
        if (lifetime.stopping || control.updateTasks === undefined) throw new Error('desktop update: Host is unavailable')
        const active = await control.updateTasks(message.action as 'inspect' | 'lock' | 'unlock')
        await send({ type: 'update-tasks', requestId: message.requestId, active })
      } catch (error) {
        await send({ type: 'update-tasks', requestId: message.requestId, active: true,
          error: error instanceof Error ? error.message : String(error) })
      }
    })().catch((error: unknown) => { console.error(error) })
  })
  const { ctx } = await application
  lifetime.assertActive()
  if (managed) ctx.provide('sepDesktopTransport', { kind: 'sep-owned-http', generation })
  if (managed) installSepPluginPolicy(ctx)
  control.updateTasks = installDesktopUpdateTaskControl(ctx)
  await ctx.plugin(desktopOffice, {
    source: process.argv[4] ?? join(runtimeDir, '..', 'runtime', 'primary-runtime'),
    root: join(resolveDshHome(), 'dsh-runtimes', 'dsh-primary-runtime'),
  })
  lifetime.assertActive()
  const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${String(ctx.webServer.port)}`)
  await lifetime.publishReady({ type: 'ready', url, injections: ctx.webServer.collectIndexInjections(),
    ...(managed ? { transport: 'desktop-http', nonce, generation, pid: process.pid, dshVersion: version } : {}),
  })
  } catch (error) {
    await lifetime.startupFailed(error)
    if ((error as { code?: string })?.code !== 'SEP_HOST_STOPPING') throw error
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const diagnostic = fatalPayload(error)
    if (process.connected) process.send?.(diagnostic, (error) => { if (error !== null) console.error(error) })
    console.error(diagnostic.code)
    process.exitCode = 1
    if (process.connected) process.disconnect()
  })
}
