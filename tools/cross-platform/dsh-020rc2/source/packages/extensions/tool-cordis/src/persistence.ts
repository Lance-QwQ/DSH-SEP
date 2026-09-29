/** Explicit source-draft tools; running and stopping use the existing Runner tools. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CordisDynamicPackageId, CordisDynamicPluginId } from '@deepseek-ai/dsh-cordis-host-runner'
import type { CordisSavedPluginId } from '@deepseek-ai/dsh-cordis-host-runner'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'

function owner(exec: ToolExecution): Agent {
  if (exec.agent === undefined) throw new Error('Cordis saved-source tools require a current Agent-backed Session')
  exec.signal.throwIfAborted()
  return exec.agent
}

/** Register only when the deployment explicitly configured bounded local storage.
 * @param ctx - the existing Cordis tool composition.
 */
export function registerPersistenceTools(ctx: Context): void {
  if (!ctx.dynamicCordisRunner.persistenceEnabled) return
  ctx.systemPrompt.section({ name: 'tool:cordis-saved-source', order: 116, text:
    'Cordis source drafts are enabled for this project. cordis_save stores an exact inspected Package without activating it. '
    + 'cordis_list_saved lists committed versions and individual failures. cordis_load_saved verifies an exact durable identity, '
    + 'version and checksum and binds it to fresh current-session IDs without running it. Use those returned IDs with cordis_run '
    + 'only after an explicit activation decision. Old Plugin, Package, Run and approval IDs cannot survive restart. '
    + 'Client approval is requested anew; awaiting-approval or starting is not success. A bad update does not automatically roll back: '
    + 'inspect the failure, then explicitly run the prior current version. Stopping or undefining removes runtime effects and keeps saved source and user data.',
  })
  ctx.tools.register(defineTool({
    name: 'cordis_save',
    description: 'Save the exact Host/Client source and metadata of one inspected Package as an immutable local draft. '
      + 'This does not run or enable the Plugin. For a later version, provide its original durableId and the latest saved version '
      + 'as expectedVersion. Current Session, project and permission scope must match; in-flight work, conflicting versions and full storage are refused.',
    parameters: {
      pluginId: { type: 'string', required: true, description: 'Exact current Plugin identity.' },
      packageId: { type: 'string', required: true, description: 'Exact current Package identity returned by define or load.' },
      durableId: { type: 'string', description: 'Existing persistent identity returned by an earlier save or load; omit only for the first save.' },
      expectedVersion: { type: 'integer', description: 'Latest saved version expected before appending; required with durableId.' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute(args, exec): Promise<JsonValue> {
      if ((args.durableId === undefined) !== (args.expectedVersion === undefined)) throw new Error('durableId and expectedVersion must be supplied together')
      return await ctx.dynamicCordisRunner.savePackage(owner(exec), {
        pluginId: CordisDynamicPluginId(args.pluginId), packageId: CordisDynamicPackageId(args.packageId),
        ...args.durableId === undefined ? {} : { durableId: args.durableId as CordisSavedPluginId },
        ...args.expectedVersion === undefined ? {} : { expectedVersion: args.expectedVersion },
      }) as unknown as JsonValue
    },
  }))
  ctx.tools.register(defineTool({
    name: 'cordis_list_saved',
    description: 'List bounded saved-source version descriptors for this Session and project without returning code or running anything. '
      + 'Unavailable entries remain visible. Select a known version and checksum explicitly; a saved entry is not a health or activation result.',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute(_args, exec): Promise<JsonValue> {
      return { versions: await ctx.dynamicCordisRunner.listSaved(owner(exec)) } as unknown as JsonValue
    },
  }))
  ctx.tools.register(defineTool({
    name: 'cordis_load_saved',
    description: 'Validate and load one exact saved Plugin version into the current Session without activation. '
      + 'Use its fresh returned Plugin and Package IDs with the existing inspect/run/update/stop tools. '
      + 'No old approval is restored, no dependencies are downloaded, and no user data or older snapshot is copied back.',
    parameters: {
      durableId: { type: 'string', required: true, description: 'Exact persistent identity from a saved-source descriptor.' },
      version: { type: 'integer', required: true, description: 'Exact immutable saved version.' },
      sha256: { type: 'string', required: true, description: 'Exact expected SHA-256 from that version descriptor.' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    async execute(args, exec): Promise<JsonValue> {
      return await ctx.dynamicCordisRunner.loadSaved(owner(exec), {
        durableId: args.durableId as CordisSavedPluginId, version: args.version, sha256: args.sha256,
      }) as unknown as JsonValue
    },
  }))
}
