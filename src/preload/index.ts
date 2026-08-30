import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
  }
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
