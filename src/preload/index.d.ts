import { ElectronAPI } from '@electron-toolkit/preload'
import type { WindowControlsApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowControlsApi
  }
}
