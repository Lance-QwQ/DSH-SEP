/** Explicit recoverable single-file operations over the provider's execution path. @module */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { FsError } from '@deepseek-ai/dsh-fs'
import { FsSandboxController } from './sandbox.ts'
import type { FsEscalationArgs } from './sandbox.ts'
import { sessionResolveOptions } from './session-cwd.ts'

interface ManageArgs extends FsEscalationArgs { action: string; file_path: string; destination?: string }
interface RecoveryArgs extends FsEscalationArgs { action: string; mutation_id?: string }

/** Register managed mutations when the provider declares its recovery capability.
 * @param ctx - tool consumer context with filesystem and tool services.
 * @param sandbox - current composition's policy/escalation controller.
 */
export function applyManagedFileTools(ctx: Context, sandbox: FsSandboxController): void {
  if (ctx.fs.recoveryStatus === 'unsupported') return
  ctx.systemPrompt.context({ name: 'file:recovery', order: 112, text: () =>
    `File recovery: ${ctx.fs.recoveryStatus}. Standard file writes and managed move/delete require configured recovery storage. `
    + 'Recovery protects ordinary single-link files through the file tools. Shell commands and plugins using native file APIs are outside this backup protection.' })
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'file_manage',
    description: 'Move or delete one previously read ordinary file with a durable recovery record. Move requires an absent destination. Directories, hard links and unsupported metadata are refused.',
    parameters: {
      action: { type: 'string', required: true, enum: ['move', 'delete'] },
      file_path: { type: 'string', required: true, description: 'Source file inside the current workspace.' },
      destination: { type: 'string', description: 'Required only for move: a new file path inside this workspace.' },
      ...sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args: ManageArgs, exec) {
      if (args.action !== 'move' && args.action !== 'delete') throw new Error('action must be move or delete')
      if (!args.file_path.trim()) throw new Error('file_path must be a non-empty string')
      if ((args.action === 'move') !== (typeof args.destination === 'string' && args.destination.trim().length > 0)) {
        throw new Error('destination is required for move and must be omitted for delete')
      }
      const policy = await sandbox.resolvePolicy('file_manage', args, exec)
      const source = await ctx.fs.resolve(args.file_path, sessionResolveOptions(exec, policy?.workspaceRoot))
      const observed = await ctx.waterfall('fs/edit-intent', source, exec, () => undefined)
      const info = await ctx.fs.stat(source, exec.signal)
      if (info === undefined) throw new FsError('managed source does not exist', 'FS_NOT_FOUND')
      const expected = observed ?? { version: info.version }
      // Validation above establishes destination only for a move.
      const destinationPath = args.destination as string
      const destination = args.action === 'move'
        ? await ctx.fs.resolve(destinationPath, sessionResolveOptions(exec, policy?.workspaceRoot))
        : undefined
      const result = destination === undefined
        ? await ctx.fs.removeFile(source, expected, exec.signal, policy)
        : await ctx.fs.moveFile(source, destination, expected, exec.signal, policy)
      ctx.emit('fs/observed', source, { kind: 'absent' }, exec)
      return JSON.stringify(result)
    },
    presentCall: args => ({ card: 'generic' as const, title: `${args.action} ${args.file_path}`, kind: 'execute' as const, locations: [{ path: args.file_path }] }),
  })))
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'file_recovery',
    description: 'List this workspace’s file recovery records or explicitly restore one. Restore stops if current files changed and preserves both the new data and the backup.',
    parameters: {
      action: { type: 'string', required: true, enum: ['list', 'restore'] },
      mutation_id: { type: 'string', description: 'The recorded mutation ID; required for restore.' },
      ...sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args: RecoveryArgs, exec) {
      if (args.action !== 'list' && args.action !== 'restore') throw new Error('action must be list or restore')
      if (args.action === 'restore' && !args.mutation_id?.trim()) throw new Error('mutation_id is required for restore')
      if (args.action === 'list' && args.sandbox_permissions !== undefined) throw new Error('listing recovery metadata does not support escalation')
      const policy = await sandbox.resolvePolicy('file_recovery', args, exec)
      return JSON.stringify(args.action === 'list'
        ? { status: ctx.fs.recoveryStatus, ...await ctx.fs.inspectRecovery(policy) }
        : await ctx.fs.restoreMutation(args.mutation_id as string, exec.signal, policy))
    },
    presentCall: args => ({ card: 'generic' as const, title: `file recovery ${args.action}`, kind: args.action === 'list' ? 'read' as const : 'execute' as const }),
  })))
}

