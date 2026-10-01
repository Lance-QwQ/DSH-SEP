import type { App, BrowserWindow, Menu, NativeImage, Tray } from 'electron'
/** Window-close retention; explicit application quit keeps the owned shutdown path. */
export function createSepBackgroundLifecycle(options: {
  enabled: boolean; app: App; Tray: typeof Tray; Menu: typeof Menu; icon: NativeImage;
  show(): void; canHide(): boolean; onUnavailable?(error: unknown): void;
}): { bindWindow(window: BrowserWindow): void; dispose(): void }
