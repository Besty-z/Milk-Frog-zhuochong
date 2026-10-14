import { BrowserWindow } from 'electron'
import { join } from 'node:path'

// HomeWindow：桌宠「首页」窗口。一个普通带边框的配置窗口，
// 从系统托盘「打开首页」进入，用来导入图片、管理动作和桌宠样式。

let homeWindow: BrowserWindow | null = null

function createHomeWindow() {
  homeWindow = new BrowserWindow({
    width: 480,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    title: '桌宠首页',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  homeWindow.once('ready-to-show', () => {
    homeWindow?.show()
  })

  homeWindow.on('closed', () => {
    homeWindow = null
  })

  // 首页和桌宠本体共用同一个渲染页面，用 ?view=home 区分。
  if (process.env.ELECTRON_RENDERER_URL) {
    void homeWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=home`)
  } else {
    void homeWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { view: 'home' },
    })
  }
}

export function ensureHomeWindow() {
  if (!homeWindow || homeWindow.isDestroyed()) {
    createHomeWindow()
  } else {
    homeWindow.show()
    homeWindow.focus()
  }
}

export function getHomeWindow(): BrowserWindow | null {
  return homeWindow && !homeWindow.isDestroyed() ? homeWindow : null
}
