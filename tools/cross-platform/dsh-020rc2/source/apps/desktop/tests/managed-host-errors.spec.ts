import { createServer, type Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { ManagedDesktopHost } from '../src/managed-host.ts'

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  })))
})

async function rejectedStart(code: string, status = 503): Promise<unknown> {
  const server = createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: { code, message: 'private-response-detail' } }))
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('TCP fixture required')
  const host = new ManagedDesktopHost({ endpoint: `http://127.0.0.1:${address.port}/`, token: 'a'.repeat(64),
    role: 'desktop', projectDir: process.cwd(), dshVersion: '0.2.0-rc.2', protocolVersion: 4 })
  return host.start().catch((error: unknown) => error)
}

it.each(['RECOVERY_CLOSING', 'RECOVERY_UNAUTHORIZED', 'RECOVERY_ROLE_DENIED', 'RECOVERY_MAINTENANCE'])('preserves the bounded startup refusal %s', async code => {
  const error = await rejectedStart(code)
  expect(error).toMatchObject({ code, message: code })
  expect(String(error)).not.toContain('private-response-detail')
})

it.each(['private-response-detail', 'UNRECOGNIZED_SECRET_VALUE'])('does not expose an unrecognized remote error %s', async code => {
  const error = await rejectedStart(code)
  expect(error).toMatchObject({ code: 'RECOVERY_DESKTOP_UNAVAILABLE', message: 'RECOVERY_DESKTOP_UNAVAILABLE' })
})