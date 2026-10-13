import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let positionSaveTimer: NodeJS.Timeout | null = null

const positionFile = () => join(app.getPath('userData'), 'window-position.json')

app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.disableHardwareAcceleration()
app.setPath('cache', join(app.getPath('userData'), 'cache'))

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
        click: () => mainWindow?.hide(),
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
    width: 280,
    height: 340,
    minWidth: 280,
    minHeight: 340,
    maxWidth: 280,
    maxHeight: 340,
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
  ipcMain.handle('pet:get-system-info', () => ({
    platform: process.platform,
    appVersion: app.getVersion(),
  }))

  ipcMain.on('pet:hide', () => {
    mainWindow?.hide()
  })

  ipcMain.on('pet:close', () => {
    app.quit()
  })

  ipcMain.on('pet:show', showPetWindow)
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createPetWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow()
    } else {
      showPetWindow()
    }
  })
})

app.on('before-quit', () => {
  saveWindowPosition()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
