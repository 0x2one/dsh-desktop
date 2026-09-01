import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  DESKTOP_CHANNELS,
  type BeginHotkeyCaptureResult,
  type CreateProfileResult,
  type DesktopApi,
  type DesktopSnapshot,
  type HotkeyKeyEvent,
  type HotkeyPreview,
  type SetHotkeyResult
} from './desktop-api'
import { UPDATE_CHANNELS, type UpdateState, type UpdaterApi } from './update-api'

// Tag the document with the platform before the page renders: the window
// controls plugin branches on `html[data-platform]` CSS and the preload
// bridge's `platform` field. Preload runs before the DOM is built, so defer
// to DOMContentLoaded when the document is still loading.
if (typeof document !== 'undefined') {
  const setPlatform = (): void => {
    document.documentElement.dataset.platform = process.platform
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setPlatform, { once: true })
  } else {
    setPlatform()
  }
}

// Custom APIs for renderer
const api = {
  // Platform the app runs on; the window-controls plugin renders the custom
  // button row only on Windows/Linux (macOS keeps the traffic lights).
  platform: process.platform,
  windowControls: {
    minimize: (): void => {
      ipcRenderer.send('window:minimize')
    },
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-maximize'),
    close: (): void => {
      ipcRenderer.send('window:close')
    },
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        callback(maximized)
      }
      ipcRenderer.on('window:maximized-changed', listener)
      return () => {
        ipcRenderer.removeListener('window:maximized-changed', listener)
      }
    }
  },
  updater: {
    onState: (callback: (state: UpdateState) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void => {
        callback(state)
      }
      ipcRenderer.on(UPDATE_CHANNELS.state, listener)
      return () => {
        ipcRenderer.removeListener(UPDATE_CHANNELS.state, listener)
      }
    },
    getState: (): Promise<UpdateState | null> => ipcRenderer.invoke(UPDATE_CHANNELS.getState),
    download: (): void => {
      ipcRenderer.send(UPDATE_CHANNELS.download)
    },
    installNow: (): void => {
      ipcRenderer.send(UPDATE_CHANNELS.installNow)
    },
    installLater: (): void => {
      ipcRenderer.send(UPDATE_CHANNELS.installLater)
    },
    dismiss: (): void => {
      ipcRenderer.send(UPDATE_CHANNELS.dismiss)
    }
  } satisfies UpdaterApi,
  desktop: {
    getSnapshot: (): Promise<DesktopSnapshot> => ipcRenderer.invoke(DESKTOP_CHANNELS.getSnapshot),
    beginHotkeyCapture: (): Promise<BeginHotkeyCaptureResult> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.beginHotkeyCapture),
    previewHotkey: (parts: HotkeyKeyEvent): Promise<HotkeyPreview | null> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.previewHotkey, parts),
    commitHotkey: (accelerator: string): Promise<SetHotkeyResult> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.commitHotkey, accelerator),
    cancelHotkeyCapture: (): Promise<void> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.cancelHotkeyCapture),
    setLaunchAtLogin: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.setLaunchAtLogin, enabled),
    selectProfile: (name: string): Promise<void> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.selectProfile, name),
    createProfile: (name: string): Promise<CreateProfileResult> =>
      ipcRenderer.invoke(DESKTOP_CHANNELS.createProfile, name),
    checkUpdate: (): void => {
      ipcRenderer.send(DESKTOP_CHANNELS.checkUpdate)
    },
    onChange: (callback: (snapshot: DesktopSnapshot) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: DesktopSnapshot): void => {
        callback(snapshot)
      }
      ipcRenderer.on(DESKTOP_CHANNELS.changed, listener)
      return () => {
        ipcRenderer.removeListener(DESKTOP_CHANNELS.changed, listener)
      }
    }
  } satisfies DesktopApi
}

export type WindowControlsApi = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
