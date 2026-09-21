import type { SubprocessTerminalActivity, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess';
/** Opt-in startup integration and revision tracking for one ordinary interactive shell. */
export declare class ShellActivity {
    private readonly directory;
    readonly argv: readonly string[];
    readonly env: Record<string, string>;
    private revision;
    private observed;
    private invalidated;
    private state;
    /**
     * @param directory - private startup and status file directory.
     * @param argv - shell launch preserving supported user startup files.
     * @param env - environment with any temporary startup redirect.
     */
    constructor(directory: string, argv: readonly string[], env: Record<string, string>);
    /** Invalidate prompt evidence before delivering input or a foreground signal. */
    invalidate(): void;
    /**
     * Read the latest top-level shell transition, fenced against input since that transition.
     * @param pid - original shell process id.
     * @returns lifecycle evidence; process ownership must be checked separately.
     */
    inspect(pid: number): SubprocessTerminalActivity;
    /** Remove private startup and status files after process quiescence. */
    dispose(): void;
    private read;
}
/**
 * Prepare optional Bash or Zsh integration for a plain, non-login interactive launch.
 * @param spec - terminal request; custom arguments and wrapped executables remain unmodified.
 * @param env - scrubbed target environment.
 * @param platform - execution platform.
 * @returns private integration, or undefined for unsupported launches.
 */
export declare function prepareShellActivity(spec: SubprocessTerminalSpawnSpec, env: Record<string, string>, platform: NodeJS.Platform): ShellActivity | undefined;
