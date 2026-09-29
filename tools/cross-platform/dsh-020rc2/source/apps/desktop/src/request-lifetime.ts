/** Owns desktop requests until final quit; closing a window alone does not stop requests. */
export class DesktopRequestLifetime {
  private readonly controller = new AbortController()
  private readonly pending = new Set<() => void>()
  /** @returns The shared cancellation signal; it remains open when a window is hidden. */
  get signal(): AbortSignal { return this.controller.signal }
  /** Cancels forwarding and resolves pending UI reads before Host teardown; idempotent. */
  close(): void {
    this.controller.abort()
    for (const settle of [...this.pending]) settle()
  }
  /**
   * @param operation - An accepted UI read whose late result is discarded after quit.
   * @param closedValue - Local response used when closing; not a remote cancellation receipt.
   * @returns The live result, or the closing response. Live failures remain rejected.
   */
  run<T>(operation: () => Promise<T>, closedValue: T): Promise<T> {
    if (this.signal.aborted) return Promise.resolve(closedValue)
    return new Promise<T>((resolve, reject) => {
      const settle = (): void => { this.pending.delete(settle); resolve(closedValue) }
      this.pending.add(settle)
      void Promise.resolve().then(() => this.signal.aborted ? closedValue : operation()).then(value => {
        this.pending.delete(settle)
        resolve(this.signal.aborted ? closedValue : value)
      }, (error: unknown) => {
        this.pending.delete(settle)
        if (this.signal.aborted) resolve(closedValue)
        else reject(error)
      })
    })
  }
}
