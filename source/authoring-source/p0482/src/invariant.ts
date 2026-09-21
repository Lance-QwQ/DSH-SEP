/** The UI owns no durable state or authoritative event stream to compare. */
import type { Context } from '@deepseek-ai/cordis';
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants';
export const name = 'client-ui-settings-memory-invariant';
export const inject = ['invariants'];
const install: InvariantInstaller = () => {};
/** Reserve companion ownership; behavior and disposal are covered through real composition tests. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register('@deepseek-ai/dsh-client-ui-settings-memory', install));
