import { contextBridge, ipcRenderer } from 'electron'

const desktopPetApi = {
  getSystemInfo: () => ipcRenderer.invoke('pet:get-system-info'),
  hide: () => ipcRenderer.send('pet:hide'),
  show: () => ipcRenderer.send('pet:show'),
  close: () => ipcRenderer.send('pet:close'),
  setSize: (width: number, height: number) => ipcRenderer.send('pet:set-size', width, height),
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragMove: () => ipcRenderer.send('pet:drag-move'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  setIgnoreMouse: (ignore: boolean) => ipcRenderer.send('pet:set-ignore-mouse', ignore),
  onWindowMoved: (callback: () => void) => {
    const listener = () => callback()

    ipcRenderer.on('pet:window-moved', listener)

    return () => {
      ipcRenderer.removeListener('pet:window-moved', listener)
    }
  },
}

contextBridge.exposeInMainWorld('desktopPet', desktopPetApi)
