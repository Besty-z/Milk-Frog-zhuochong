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
  getCutout: (key: string) => ipcRenderer.invoke('pet:get-cutout', key),
  saveCutout: (key: string, dataUrl: string) => ipcRenderer.send('pet:save-cutout', key, dataUrl),
  getStaticActionConfigs: () => ipcRenderer.invoke('pet:get-static-action-configs'),
  saveStaticActionConfigs: (configs: Record<string, StaticActionConfig>) =>
    ipcRenderer.send('pet:save-static-action-configs', configs),
  onStaticActionConfigsChanged: (
    callback: (configs: Record<string, StaticActionConfig>) => void,
  ) => {
    const listener = (_event: IpcRendererEvent, configs: Record<string, StaticActionConfig>) =>
      callback(configs)

    ipcRenderer.on('pet:static-action-configs-changed', listener)

    return () => {
      ipcRenderer.removeListener('pet:static-action-configs-changed', listener)
    }
  },
  getAutoLaughConfig: () => ipcRenderer.invoke('pet:get-auto-laugh-config'),
  saveAutoLaughConfig: (config: AutoLaughConfig) =>
    ipcRenderer.send('pet:save-auto-laugh-config', config),
  onAutoLaughConfigChanged: (callback: (config: AutoLaughConfig) => void) => {
    const listener = (_event: IpcRendererEvent, config: AutoLaughConfig) => callback(config)

    ipcRenderer.on('pet:auto-laugh-config-changed', listener)

    return () => {
      ipcRenderer.removeListener('pet:auto-laugh-config-changed', listener)
    }
  },
  getBuiltinVideoActionConfig: () => ipcRenderer.invoke('pet:get-builtin-video-action-config'),
  saveBuiltinVideoActionConfig: (config: BuiltinVideoActionConfig) =>
    ipcRenderer.send('pet:save-builtin-video-action-config', config),
  onBuiltinVideoActionConfigChanged: (callback: (config: BuiltinVideoActionConfig) => void) => {
    const listener = (_event: IpcRendererEvent, config: BuiltinVideoActionConfig) => callback(config)

    ipcRenderer.on('pet:builtin-video-action-config-changed', listener)

    return () => {
      ipcRenderer.removeListener('pet:builtin-video-action-config-changed', listener)
    }
  },
  getLibrary: () => ipcRenderer.invoke('pet:get-library'),
  selectImage: (id: string | null) => ipcRenderer.send('pet:select-image', id),
  deleteImage: (id: string) => ipcRenderer.send('pet:delete-image', id),
  renameImage: (id: string, name: string) => ipcRenderer.send('pet:rename-image', { id, name }),
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
