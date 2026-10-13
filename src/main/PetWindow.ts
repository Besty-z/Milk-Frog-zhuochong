import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// PetWindow：负责窗口本身的一切——创建、尺寸、位置保存、拖动移窗、
// 点击穿透、系统托盘、「回到屏幕内」。渲染进程通过 IPC 调用这里的能力。

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let positionSaveTimer: NodeJS.Timeout | null = null
let dragStartWindow: { x: number; y: number } | null = null
let dragStartCursor: { x: number; y: number } | null = null

function positionFile(): string {
  return join(app.getPath('userData'), 'window-position.json')
}

function readSavedPosition() {
  const file = positionFile()

  if (!existsSync(file)) {
    return undefined
  }

  try {
    const savedPosition = JSON.parse(readFileSync(file, 'utf8')) as { x?: unknown; y?: unknown }

    if (typeof savedPosition.x === 'number' && typeof savedPosition.y === 'number') {
      return { x: savedPosition.x, y: savedPosition.y }
    }
  } catch {
    return undefined
  }

  return undefined
}

function saveWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const [x, y] = mainWindow.getPosition()
  const file = positionFile()

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file, JSON.stringify({ x, y }), 'utf8')
}

function schedulePositionSave() {
  if (positionSaveTimer) {
    clearTimeout(positionSaveTimer)
  }

  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null
    saveWindowPosition()
  }, 250)
}

function showPetWindow() {
  mainWindow?.show()
  mainWindow?.focus()
}

function hidePetWindow() {
  mainWindow?.hide()
}

function centerPetWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const { workArea } = screen.getPrimaryDisplay()
  const [width, height] = mainWindow.getSize()
  mainWindow.setPosition(
    Math.round(workArea.x + (workArea.width - width) / 2),
    Math.round(workArea.y + (workArea.height - height) / 2),
  )
  mainWindow.show()
  mainWindow.focus()
}

function createTray() {
  if (tray) {
    return
  }

  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray-16.png'))

  if (icon.isEmpty()) {
    return
  }

  tray = new Tray(icon)
  tray.setToolTip('Milk Frog 桌宠')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示桌宠',
        click: showPetWindow,
      },
      {
        label: '隐藏桌宠',
        click: hidePetWindow,
      },
      {
        label: '回到屏幕内',
        click: centerPetWindow,
      },
      { type: 'separator' },
      {
        label: '退出程序',
        click: () => app.quit(),
      },
    ]),
  )
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      showPetWindow()
    }
  })
}

function createPetWindow() {
  const savedPosition = readSavedPosition()

  mainWindow = new BrowserWindow({
    width: 150,
    height: 185,
    ...savedPosition,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    saveWindowPosition()
    mainWindow = null
  })

  mainWindow.on('move', () => {
    mainWindow?.webContents.send('pet:window-moved')
    schedulePositionSave()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers() {
  ipcMain.on('pet:hide', () => {
    hidePetWindow()
  })

  ipcMain.on('pet:close', () => {
    app.quit()
  })

  ipcMain.on('pet:show', showPetWindow)

  ipcMain.on('pet:set-size', (_event, width: number, height: number) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.setSize(Math.round(width), Math.round(height))
  })

  ipcMain.on('pet:drag-start', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    const [x, y] = mainWindow.getPosition()
    dragStartWindow = { x, y }
    const point = screen.getCursorScreenPoint()
    dragStartCursor = { x: point.x, y: point.y }
  })

  ipcMain.on('pet:drag-move', () => {
    if (!mainWindow || !dragStartWindow || !dragStartCursor) {
      return
    }

    const point = screen.getCursorScreenPoint()
    mainWindow.setPosition(
      dragStartWindow.x + (point.x - dragStartCursor.x),
      dragStartWindow.y + (point.y - dragStartCursor.y),
    )
  })

  ipcMain.on('pet:drag-end', () => {
    dragStartWindow = null
    dragStartCursor = null
  })

  ipcMain.on('pet:set-ignore-mouse', (_event, ignore: boolean) => {
    mainWindow?.setIgnoreMouseEvents(ignore, { forward: true })
  })
}

export function initPetWindow() {
  registerIpcHandlers()
  createPetWindow()
  createTray()
}

export function ensurePetWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createPetWindow()
  } else {
    showPetWindow()
  }
}

export function saveWindowPositionOnQuit() {
  saveWindowPosition()
}
