/** Linux user-systemd scope launch and managed-range ownership. */
import { spawn, spawnSync } from 'node:child_process';
import type { SubprocessOutcome, SubprocessSpawnSpec, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import { loadLinuxExecve } from './linux-execve.ts';
import type { BoundProcessOwner, ManagedProcessLaunch } from './managed-owner.ts';
import type { RunnerInvocation } from './runner-launch.ts';
/** Test seams for systemd command execution. */
export interface LinuxScopeInternals {
    spawn?: typeof spawn;
    spawnSync?: typeof spawnSync;
    systemctlQuery?: (command: string, args: readonly string[]) => Promise<SystemctlResult>;
    systemdRun?: string;
    systemctl?: string;
    runnerInvocation?: RunnerInvocation;
    resolveRunnerInvocation?: () => RunnerInvocation;
    runnerAvailable?: (invocation: RunnerInvocation) => boolean;
    loadLinuxExecve?: typeof loadLinuxExecve;
    sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}
interface SystemctlResult {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
}
/**
 * Confirm this exact runner entry and libc execve binding without a probe mode.
 * @param internals - optional runner and libc-binding seams used by tests.
 * @returns whether the bootstrap can enter the final target.
 */
export declare function probeLinuxBootstrap(internals?: LinuxScopeInternals): boolean;
/**
 * Confirm current literal-argv transient-scope support before selecting native launch.
 * @param internals - optional systemd command seams used by tests.
 * @returns whether the current user manager supports the required scope invocation.
 */
export declare function probeLinuxScope(internals?: LinuxScopeInternals): boolean;
/**
 * Confirm that the current user manager remains reachable after a positive deep probe.
 * @param internals - optional systemctl seam used by tests.
 * @returns whether one lightweight manager query succeeds.
 */
export declare function probeLinuxManager(internals?: LinuxScopeInternals): boolean;
/**
 * Re-check every Linux native prerequisite for one eligible spawn.
 * @param internals - optional native capability seams used by tests.
 * @returns whether the Linux native containment path is currently available.
 */
export declare function probeLinuxNative(internals?: LinuxScopeInternals): boolean;
interface DirectRange {
    running(): boolean;
    /** True for group TERM delivery, direct signal submission, or proven direct-PID absence. */
    signal(signal: 'SIGTERM' | 'SIGKILL'): boolean;
    /** Direct exit/error settlement, independent of output drain and managed-range completion. */
    settled: Promise<unknown>;
}
/**
 * Send a direct-process signal, distinguishing an absent PID from failed delivery.
 * @param pid - owned direct-process identity whose exit notification can still be pending.
 * @param send - platform signal operation; true means the signal was submitted.
 * @returns whether the signal was submitted or the owned PID is already absent.
 */
export declare function signalLinuxDirectProcess(pid: number, send: () => boolean): boolean;
/** Linux PTY invocation and owner for the exact one-shot scope/bootstrap. */
export interface LinuxTerminalScopeLaunch {
    command: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    bindOwner: (direct: DirectRange) => BoundProcessOwner;
    resolveOutcome: (outcome: SubprocessOutcome) => SubprocessOutcome;
    cleanup: () => void;
}
/**
 * Prepare one Linux PTY scope using the same launch request and bootstrap core.
 * @param spec - terminal target request.
 * @param targetEnv - validated complete target environment.
 * @param internals - optional runner and systemd seams used by tests.
 * @returns invocation and ownership callbacks; requested termination preserves the observed signal even before bootstrap consumption.
 */
export declare function prepareLinuxTerminalScope(spec: SubprocessTerminalSpawnSpec, targetEnv: Record<string, string>, internals?: LinuxScopeInternals): LinuxTerminalScopeLaunch;
/**
 * Launch one ordinary target inside a transient user scope.
 * @param spec - ordinary target request.
 * @param targetEnv - validated complete target environment.
 * @param internals - optional runner and systemd seams used by tests.
 * @returns streams, result, and scope owner; requested termination preserves the observed signal even before bootstrap consumption.
 */
export declare function launchLinuxScope(spec: SubprocessSpawnSpec, targetEnv: Record<string, string>, internals?: LinuxScopeInternals): ManagedProcessLaunch;
export {};
