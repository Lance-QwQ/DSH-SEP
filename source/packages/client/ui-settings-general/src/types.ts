/** Type-only Electron update declarations shared by the settings UI and Desktop compatibility checks. */

/** Classified failure copy selected by the Web locale without exposing raw updater diagnostics. */
export type DesktopUpdateFailureKind =
  | 'check'
  | 'check-network'
  | 'download'
  | 'download-network'
  | 'install'
  | 'install-network'
  | 'stop-failed'
  | 'tasks-changed'
  | 'tasks-unavailable'

/** Public semantic preload fields consumed by the settings row. */
export interface DesktopUpdatePresentation {
  readonly phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly percent?: number
  readonly failure?: DesktopUpdateFailureKind
}

/** Optional carrier API; it cannot select artifacts or authorize installation. */
export interface DesktopUpdateBridge {
  status(): Promise<DesktopUpdatePresentation>
  open(): Promise<void>
  subscribe(listener: (state: DesktopUpdatePresentation) => void): () => void
}

/** Shared carrier status for the account row and collapsed sidebar badge. */
export interface DesktopUpdateView {
  readonly presentation?: DesktopUpdatePresentation
  readonly failed: boolean
  readonly opening: boolean
}

/** Minimum maturity included in DSH and SEP update discovery. */
export type UpdateFilterStrength = 'weak' | 'medium' | 'strong'

/** Main-process persisted update discovery preference. */
export interface DesktopUpdatePreferences {
  readonly strength: UpdateFilterStrength
}

/** Optional managed Desktop preference API; it cannot authorize installation. */
export interface DesktopUpdatePreferencesBridge {
  get(): Promise<DesktopUpdatePreferences | null>
  set(strength: UpdateFilterStrength): Promise<DesktopUpdatePreferences>
  subscribe(listener: (preferences: DesktopUpdatePreferences) => void): () => void
}
