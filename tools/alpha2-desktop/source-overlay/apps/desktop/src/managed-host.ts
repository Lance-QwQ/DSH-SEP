/** Electron-side client for an independently owned SEP Desktop Host.
 * Electron 仅连接独立恢复中心，不创建、替换或直接终止其宿主进程。
 */
import { lstat, open, realpath } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'


import type { DesktopHostReady } from './host-process.ts'

export interface ManagedDesktopConnection {
  readonly endpoint: string
  readonly token: string
  readonly role: 'desktop'
  readonly projectDir: string
  readonly dshVersion: string
  readonly protocolVersion: 4
}
const key = (path: string): string => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
function validate(value: unknown): ManagedDesktopConnection {
  if (value === null || typeof value !== 'object') throw new Error('RECOVERY_DESKTOP_CONNECTION')
  const v = value as Record<string, unknown>
  if (typeof v.endpoint !== 'string' || typeof v.token !== 'string' || !/^[a-f0-9]{64}$/u.test(v.token)
    || v.role !== 'desktop' || typeof v.projectDir !== 'string' || !isAbsolute(v.projectDir)
    || typeof v.dshVersion !== 'string' || !/^[0-9A-Za-z.+-]{1,80}$/u.test(v.dshVersion) || v.protocolVersion !== 4) throw new Error('RECOVERY_DESKTOP_CONNECTION')
  const url = new URL(v.endpoint)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('RECOVERY_DESKTOP_CONNECTION')
  return { endpoint: url.href, token: v.token, role: 'desktop', projectDir: v.projectDir, dshVersion: v.dshVersion, protocolVersion: 4 }
}
/** Read only a bounded, locally identifiable discovery file; keep its capability in main.
 * 只读取大小受限、可核验本地身份的连接文件；权限令牌始终留在主进程。
 */
export async function readManagedDesktopConnection(path: string): Promise<ManagedDesktopConnection> {
  if (!isAbsolute(path) || key(await realpath(path)) !== key(path)) throw new Error('RECOVERY_DESKTOP_CONNECTION')
  const before = await lstat(path)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.ino === 0 || before.size > 16384) throw new Error('RECOVERY_DESKTOP_CONNECTION')
  const file = await open(path, 'r')
  try {
    const held = await file.stat()
    if (held.dev !== before.dev || held.ino !== before.ino || held.nlink !== 1 || held.size !== before.size) throw new Error('RECOVERY_DESKTOP_CONNECTION')
    const bytes = Buffer.alloc(16385)
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    const after = await file.stat(), visible = await lstat(path)
    if (bytesRead > 16384 || bytesRead !== held.size || after.mtimeMs !== held.mtimeMs || after.nlink !== 1
      || visible.dev !== held.dev || visible.ino !== held.ino || key(await realpath(path)) !== key(path)) throw new Error('RECOVERY_DESKTOP_CONNECTION')
    const raw = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')) as Record<string, unknown>
    return validate(raw.desktop ?? raw)
  } finally { await file.close() }
}
async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader()
  if (reader === undefined) throw new Error('RECOVERY_DESKTOP_RESPONSE')
  let length = 0; const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break
      length += next.value.byteLength
      if (length > 4 * 1024 * 1024) { await reader.cancel(); throw new Error('RECOVERY_DESKTOP_RESPONSE') }
      chunks.push(next.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  } finally { reader.releaseLock() }
}

/** SEP owns child creation and shutdown; this client only acquires one authenticated generation. */
export class ManagedDesktopHost {
  private readonly connection: ManagedDesktopConnection
  private readonly onFailure: ((error: Error) => void) | undefined
  private poll: ReturnType<typeof setTimeout> | undefined
  private generation: number | undefined
  private stopping = false
  constructor(connection: ManagedDesktopConnection, onFailure?: (error: Error) => void) {
    this.connection = validate(connection); this.onFailure = onFailure
  }
  private async call(method: string): Promise<Record<string, unknown>> {
    const response = await fetch(new URL('rpc', this.connection.endpoint), {
      method: 'POST', headers: { authorization: `Bearer ${this.connection.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ method, params: {} }), signal: AbortSignal.timeout(55000), redirect: 'error',
    })
    const body = await boundedJson(response)
    if (!response.ok || body.ok !== true || body.result === null || typeof body.result !== 'object') {
      const remote = body.error
      const candidate = remote !== null && typeof remote === 'object' && 'code' in remote ? remote.code : undefined
      // Only protocol-owned refusal identifiers may reach the crash dialog.
      const known = new Set(['RECOVERY_CLOSING', 'RECOVERY_UNAUTHORIZED', 'RECOVERY_ROLE_DENIED',
        'RECOVERY_HOST_HEADER', 'RECOVERY_ORIGIN', 'RECOVERY_METHOD', 'RECOVERY_ROUTE',
        'RECOVERY_JSON', 'RECOVERY_REQUEST_TOO_LARGE', 'RECOVERY_MAINTENANCE',
        'RECOVERY_OPERATION_FAILED', 'RECOVERY_DESKTOP_UNAVAILABLE'])
      const code = typeof candidate === 'string' && known.has(candidate) ? candidate : 'RECOVERY_DESKTOP_UNAVAILABLE'
      throw Object.assign(new Error(code), { code })
    }
    return body.result as Record<string, unknown>
  }
  private async identity(): Promise<Record<string, unknown>> {
    const status = await this.call('desktopStatus')
    if (typeof status.projectDir !== 'string' || key(status.projectDir) !== key(this.connection.projectDir)
      || status.dshVersion !== this.connection.dshVersion || status.protocolVersion !== 4 || status.transport !== 'desktop-http') throw new Error('RECOVERY_DESKTOP_IDENTITY')
    return status
  }
  async start(): Promise<DesktopHostReady & { transport: 'desktop-http'; generation: number }> {
    await this.identity(); const started = await this.call('startHost')
    if (started.phase !== 'running') throw new Error('RECOVERY_DESKTOP_UNAVAILABLE')
    const ready = await this.call('desktopReady'), status = await this.identity()
    const guardian = status.guardian as Record<string, unknown> | undefined
    if (guardian === undefined || ready.transport !== 'desktop-http' || ready.dshVersion !== this.connection.dshVersion || !Array.isArray(ready.injections)
      || !Number.isSafeInteger(ready.generation) || ready.generation !== started.generation || ready.generation !== guardian?.generation
      || ready.pid !== started.pid || ready.pid !== guardian.pid || guardian.phase !== 'running' || typeof ready.url !== 'string') throw new Error('RECOVERY_DESKTOP_IDENTITY')
    const url = new URL(ready.url)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.hash || url.pathname !== '/'
      || [...url.searchParams.keys()].length !== 1 || !/^[A-Za-z0-9_-]{16,256}$/u.test(url.searchParams.get('token') ?? '')) throw new Error('RECOVERY_DESKTOP_IDENTITY')
    this.generation = ready.generation as number; this.stopping = false
    if (this.onFailure !== undefined) this.watch()
    return { url: url.href, injections: ready.injections, transport: 'desktop-http', generation: this.generation }
  }
  private watch(): void {
    this.poll = setTimeout(() => { void (async () => {
      try {
        const status = await this.identity(), guardian = status.guardian as Record<string, unknown> | undefined
        if (this.stopping) return
        if (guardian?.phase !== 'running' || guardian.generation !== this.generation) throw new Error('RECOVERY_DESKTOP_GENERATION_CHANGED')
        this.watch()
      } catch (error) { if (!this.stopping) this.onFailure?.(error instanceof Error ? error : new Error('RECOVERY_DESKTOP_UNAVAILABLE')) }
    })() }, 1000)
    this.poll.unref()
  }
  async stop(requireCleanStop = false): Promise<void> {
    this.stopping = true; clearTimeout(this.poll)
    const stopped = await this.call('stopHost')
    const exit = stopped.lastExit as { forced?: unknown; code?: unknown } | undefined
    if (stopped.phase !== 'stopped' || (requireCleanStop && (exit?.forced !== false || exit.code !== 0))) throw new Error('RECOVERY_DESKTOP_STOP_UNCONFIRMED')
  }
  /** Native updater cannot replace a SEP-owned release or bypass its compatibility/maintenance checks. */
  async updateTasks(_action: 'inspect' | 'lock' | 'unlock'): Promise<boolean> { throw new Error('SEP_CONTROLLED_UPDATE_REQUIRED') }
  /** A missing or invalid owned Host response remains unknown and triggers the native quit warning. */
  async inspectQuit(): Promise<{ activeTasks: boolean; scheduledTasks: boolean }> {
    await this.identity()
    const result = await this.call('desktopQuitInspection')
    if (typeof result.activeTasks !== 'boolean' || typeof result.scheduledTasks !== 'boolean') throw new Error('RECOVERY_QUIT_UNKNOWN')
    return { activeTasks: result.activeTasks, scheduledTasks: result.scheduledTasks }
  }
}

