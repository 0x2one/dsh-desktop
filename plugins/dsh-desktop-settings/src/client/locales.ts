/** Copy dictionaries for the Desktop settings section. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  nav: 'Desktop',
  hotkeyTitle: 'Shortcut',
  hotkeyDescription: 'Show or hide the main window',
  hotkeyEdit: 'Change…',
  launchTitle: 'Launch at login',
  launchOn: 'On',
  launchOff: 'Off',
  profileTitle: 'Startup environment',
  profileCreate: 'New environment…',
  updateTitle: 'Updates',
  updateAction: 'Check for updates…'
}

/** Chinese strings matching the tray labels. */
export const zh = {
  nav: '桌面',
  hotkeyTitle: '快捷键',
  hotkeyDescription: '显示或隐藏主窗口',
  hotkeyEdit: '修改…',
  launchTitle: '开机自启',
  launchOn: '开启',
  launchOff: '关闭',
  profileTitle: '启动环境',
  profileCreate: '新增环境…',
  updateTitle: '检查更新',
  updateAction: '检查更新…'
} satisfies { [K in keyof typeof en]: string }

/** Dictionary keys owned by this plugin. */
export type DesktopKey = keyof typeof en
