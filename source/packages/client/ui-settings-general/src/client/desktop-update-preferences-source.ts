/** Accepted Desktop preferences and their renderer request state. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DesktopUpdatePreferences, DesktopUpdatePreferencesBridge, UpdateFilterStrength } from '../types.ts'

/** Shared observation of the main-process preference and pending UI work. */
export interface DesktopUpdatePreferencesView {
  readonly preferences?: DesktopUpdatePreferences | null
  readonly saving: boolean
  readonly failed: boolean
}

/** Owns the optional preference carrier until the settings plugin unloads. */
export class DesktopUpdatePreferencesSource {
  readonly store = createSnapshotStore<DesktopUpdatePreferencesView>({ saving: false, failed: false })
  private live = true
  private revision = 0
  private readonly unsubscribe: (() => void) | undefined

  /** @param bridge - Managed Desktop bridge, absent in ordinary browsers. */
  constructor(private readonly bridge: DesktopUpdatePreferencesBridge | undefined) {
    this.unsubscribe = bridge?.subscribe(preferences => {
      if (!this.live) return
      this.revision++
      this.store.set({ ...this.store.getSnapshot(), preferences, failed: false })
    })
    this.reload()
  }

  /** Read persisted preferences without replacing a newer carrier event. */
  reload(): void {
    if (!this.live || this.bridge === undefined) return
    const revision = ++this.revision
    this.store.set({ ...this.store.getSnapshot(), failed: false })
    void this.bridge.get().then(preferences => {
      if (this.live && revision === this.revision) this.store.set({ ...this.store.getSnapshot(), preferences })
    }, () => {
      if (this.live && revision === this.revision) this.store.set({ ...this.store.getSnapshot(), failed: true })
    })
  }

  /**
   * Save one choice while retaining the last accepted value on failure.
   * @param strength - User-selected discovery filter.
   */
  set(strength: UpdateFilterStrength): void {
    const state = this.store.getSnapshot()
    if (!this.live || this.bridge === undefined || state.saving || !state.preferences
      || state.preferences.strength === strength) return
    const revision = this.revision
    this.store.set({ ...state, saving: true, failed: false })
    void this.bridge.set(strength).then(preferences => {
      if (this.live && revision === this.revision) this.store.set({ ...this.store.getSnapshot(), preferences })
    }, () => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), failed: true })
    }).finally(() => {
      if (this.live) this.store.set({ ...this.store.getSnapshot(), saving: false })
    })
  }

  /** Detach the carrier and ignore pending request completions. */
  dispose(): void { this.live = false; this.unsubscribe?.() }
}
