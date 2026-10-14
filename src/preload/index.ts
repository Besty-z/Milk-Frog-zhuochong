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
  chooseAudio: () => ipcRenderer.invoke('pet:choose-audio'),
  applyImage: (image: { dataUrl: string; name: string }) =>
    ipcRenderer.send('pet:apply-image', image),
  applyGif: (gif: GifImportData) => ipcRenderer.send('pet:apply-gif', gif),
  applyVideo: (video: VideoImportData) => ipcRenderer.send('pet:apply-video', video),
  updateGifActions: (arg: { id: string; actions: PetActionDef[] }) =>
    ipcRenderer.send('pet:update-gif-actions', arg),
  chooseVideo: () => ipcRenderer.invoke('pet:choose-video'),
  applyVideoAction: (arg: { id: string | null; action: VideoActionDef }) =>
    ipcRenderer.send('pet:apply-video-action', arg),
  updateVideoActions: (arg: { id: string | null; actions: VideoActionDef[] }) =>
    ipcRenderer.send('pet:update-video-actions', arg),
  getDefaultVideoActions: () => ipcRenderer.invoke('pet:get-default-video-actions'),
  getCurrentPet: () => ipcRenderer.invoke('pet:get-current-pet'),
  getDefaultCutout: () => ipcRenderer.invoke('pet:get-default-cutout'),
  saveDefaultCutout: (dataUrl: string) => ipcRenderer.send('pet:save-default-cutout', dataUrl),
  getLibrary: () => ipcRenderer.invoke('pet:get-library'),
  selectImage: (id: string | null) => ipcRenderer.send('pet:select-image', id),
  deleteImage: (id: string) => ipcRenderer.send('pet:delete-image', id),
  triggerAction: (action: string) => ipcRenderer.send('pet:trigger-action', action),
  logError: (message: string) => ipcRenderer.send('pet:log-error', message),
  onTriggerAction: (callback: (action: string) => void) => {
    const listener = (_event: IpcRendererEvent, action: string) => callback(action)

    ipcRenderer.on('pet:trigger-action', listener)

    return () => {
      ipcRenderer.removeListener('pet:trigger-action', listener)
    }
  },
  onPetChanged: (callback: (pet: PetDescriptor | null) => void) => {
    const listener = (_event: IpcRendererEvent, pet: PetDescriptor | null) => callback(pet)

    ipcRenderer.on('pet:current-changed', listener)

    return () => {
      ipcRenderer.removeListener('pet:current-changed', listener)
    }
  },
  onDefaultVideoActionsChanged: (callback: (actions: VideoActionDef[]) => void) => {
    const listener = (_event: IpcRendererEvent, actions: VideoActionDef[]) => callback(actions)

    ipcRenderer.on('pet:default-video-actions-changed', listener)

    return () => {
      ipcRenderer.removeListener('pet:default-video-actions-changed', listener)
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
