import { contextBridge, ipcRenderer } from 'electron'

const desktopPetApi = {
  getSystemInfo: () => ipcRenderer.invoke('pet:get-system-info'),
  hide: () => ipcRenderer.send('pet:hide'),
  show: () => ipcRenderer.send('pet:show'),
  close: () => ipcRenderer.send('pet:close'),
  onWindowMoved: (callback: () => void) => {
    const listener = () => callback()

    ipcRenderer.on('pet:window-moved', listener)

    return () => {
      ipcRenderer.removeListener('pet:window-moved', listener)
    }
  },
}

contextBridge.exposeInMainWorld('desktopPet', desktopPetApi)
