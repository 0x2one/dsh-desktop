import { ElectronAPI } from '@electron-toolkit/preload'
import type { WindowControlsApi } from './index'
import type { DshDesktopApi } from './dsh-desktop-bridge'

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowControlsApi
    dshDesktop: DshDesktopApi
  }
}
