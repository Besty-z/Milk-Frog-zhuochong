import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { ensurePetWindow, initPetWindow, saveWindowPositionOnQuit } from './PetWindow'
import { initPetAssets } from './PetAssets'

app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.disableHardwareAcceleration()
app.setPath('cache', join(app.getPath('userData'), 'cache'))

ipcMain.handle('pet:get-system-info', () => ({
  platform: process.platform,
  appVersion: app.getVersion(),
}))

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
