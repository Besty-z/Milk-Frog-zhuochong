import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { appendFileSync, mkdirSync } from 'node:fs'
import { ensurePetWindow, initPetWindow, saveWindowPositionOnQuit } from './PetWindow'
import { initPetAssets } from './PetAssets'

app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.disableHardwareAcceleration()
// 抠图用的 onnxruntime-web 需要 SharedArrayBuffer（多线程 wasm）。
// Electron 默认没开跨源隔离，这里用 Chromium 特性开关把它放出来。
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
app.setPath('cache', join(app.getPath('userData'), 'cache'))

ipcMain.handle('pet:get-system-info', () => ({
  platform: process.platform,
  appVersion: app.getVersion(),
}))

// 渲染进程把报错传到这里，写进 userData/error.log，方便排查（不用用户手抄弹窗）
ipcMain.on('pet:log-error', (_event, message: unknown) => {
  const text = typeof message === 'string' ? message : JSON.stringify(message)
  try {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'error.log'), `[${new Date().toISOString()}] ${text}\n`, 'utf8')
  } catch {
    // 写日志失败就算了，不影响主流程
  }
})

app.whenReady().then(() => {
  initPetWindow()
  initPetAssets()

  app.on('activate', () => {
    ensurePetWindow()
  })
})

app.on('before-quit', () => {
  saveWindowPositionOnQuit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
