import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'

let mainWindow: BrowserWindow | null = null

function createPetWindow() {
  mainWindow = new BrowserWindow({
    width: 280,
    height: 340,
    minWidth: 280,
    minHeight: 340,
    maxWidth: 280,
    maxHeight: 340,
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
    mainWindow = null
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
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createPetWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
