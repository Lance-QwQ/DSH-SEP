export function safeHostCode(value: unknown): string | undefined;
export function fatalPayload(error: unknown): { type: 'fatal'; code: string; message: string };
export function startupFailure(run?: { hostCode?: unknown }): Error & { code: string; hostCode?: string };
