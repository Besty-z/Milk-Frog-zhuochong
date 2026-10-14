import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const desktopPetApi = {
  getSystemInfo: () => ipcRenderer.invoke('pet:get-system-info'),
  hide: () => ipcRenderer.send('pet:hide'),
  show: () => ipcRenderer.send('pet:show'),
  close: () => ipcRenderer.send('pet:close'),
  setSize: (width: number, height: number) => ipcRenderer.send('pet:set-size', width, height),
  dragStart: (screenX: number, screenY: number) =>
    ipcRenderer.send('pet:drag-start', screenX, screenY),
  dragMove: (screenX: number, screenY: number) =>
    ipcRenderer.send('pet:drag-move', screenX, screenY),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  setIgnoreMouse: (ignore: boolean) => ipcRenderer.send('pet:set-ignore-mouse', ignore),
  chooseImage: () => ipcRenderer.invoke('pet:choose-image'),
  applyImage: (image: { dataUrl: string; name: string }) =>
    ipcRenderer.send('pet:apply-image', image),
  getCurrentImage: () => ipcRenderer.invoke('pet:get-current-image'),
  getLibrary: () => ipcRenderer.invoke('pet:get-library'),
  selectImage: (id: string | null) => ipcRenderer.send('pet:select-image', id),
  deleteImage: (id: string) => ipcRenderer.send('pet:delete-image', id),
  triggerAction: (action: string) => ipcRenderer.send('pet:trigger-action', action),
  onTriggerAction: (callback: (action: string) => void) => {
    const listener = (_event: IpcRendererEvent, action: string) => callback(action)

    ipcRenderer.on('pet:trigger-action', listener)

    return () => {
      ipcRenderer.removeListener('pet:trigger-action', listener)
    }
  },
  onPetImageChanged: (callback: (dataUrl: string | null) => void) => {
    const listener = (_event: IpcRendererEvent, dataUrl: string | null) => callback(dataUrl)

    ipcRenderer.on('pet:image-changed', listener)

    return () => {
      ipcRenderer.removeListener('pet:image-changed', listener)
    }
  },
  onWindowMoved: (callback: () => void) => {
    const listener = () => callback()

    ipcRenderer.on('pet:window-moved', listener)

    return () => {
      ipcRenderer.removeListener('pet:window-moved', listener)
    }
  },
}

contextBridge.exposeInMainWorld('desktopPet', desktopPetApi)
