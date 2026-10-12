import { contextBridge, ipcRenderer } from 'electron'

const desktopPetApi = {
  getSystemInfo: () => ipcRenderer.invoke('pet:get-system-info'),
  hide: () => ipcRenderer.send('pet:hide'),
  close: () => ipcRenderer.send('pet:close'),
}

contextBridge.exposeInMainWorld('desktopPet', desktopPetApi)
