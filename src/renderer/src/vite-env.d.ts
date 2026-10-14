/// <reference types="vite/client" />

interface SystemInfo {
  platform: string
  appVersion: string
}

// 一个动作 = 一段帧区间 + 名字 + 是否循环（只对动图有意义）
interface PetActionDef {
  id: string
  name: string
  startFrame: number
  endFrame: number
  loop: boolean
  soundDataUrl?: string
}

// 动作视频片段：一个动作 = 一段短视频，触发时才播。挂在哪只桌宠名下就只属于它。
interface VideoActionDef {
  id: string
  name: string
  dataUrl: string
  loop: boolean
}

// 动图数据：导入时已在渲染进程解码成帧、裁到包围盒，运行时直接播放。
interface GifPetData {
  frames: string[]
  delays: number[]
  width: number
  height: number
  alphaDataUrl: string
  actions: PetActionDef[]
  videoActions: VideoActionDef[]
}

// 「当前桌宠」的描述：静态图、动图或整段视频。null 表示用默认桌宠。
type PetDescriptor =
  | { kind: 'image'; id: string; dataUrl: string; videoActions: VideoActionDef[] }
  | ({ kind: 'gif'; id: string } & GifPetData)
  | { kind: 'video'; id: string; dataUrl: string; width: number; height: number; videoActions: VideoActionDef[] }

// 导入动图时的入参（动作先留空，由主进程生成）
interface GifImportData {
  name: string
  frames: string[]
  delays: number[]
  width: number
  height: number
  alphaDataUrl: string
}

interface VideoImportData {
  name: string
  dataUrl: string
  width: number
  height: number
}

interface LibraryImage {
  id: string
  name: string
  kind: 'image' | 'gif' | 'video'
  dataUrl: string
  frames: string[]
  delays: number[]
  width: number
  height: number
  alphaDataUrl: string
  actions: PetActionDef[]
  videoActions: VideoActionDef[]
}

interface PetLibrary {
  images: LibraryImage[]
  currentId: string | null
}

interface DesktopPetApi {
  getSystemInfo: () => Promise<SystemInfo>
  hide: () => void
  show: () => void
  close: () => void
  setSize: (width: number, height: number) => void
  dragStart: (screenX: number, screenY: number) => void
  dragMove: (screenX: number, screenY: number) => void
  dragEnd: () => void
  setIgnoreMouse: (ignore: boolean) => void
  chooseImage: () => Promise<{ dataUrl: string; name: string } | null>
  chooseAudio: () => Promise<{ dataUrl: string; name: string } | null>
  applyImage: (image: { dataUrl: string; name: string }) => void
  applyGif: (gif: GifImportData) => void
  applyVideo: (video: VideoImportData) => void
  updateGifActions: (arg: { id: string; actions: PetActionDef[] }) => void
  chooseVideo: () => Promise<{ dataUrl: string; name: string } | null>
  applyVideoAction: (arg: { id: string | null; action: VideoActionDef }) => void
  updateVideoActions: (arg: { id: string | null; actions: VideoActionDef[] }) => void
  getDefaultVideoActions: () => Promise<VideoActionDef[]>
  getCurrentPet: () => Promise<PetDescriptor | null>
  getDefaultCutout: () => Promise<string | null>
  saveDefaultCutout: (dataUrl: string) => void
  getLibrary: () => Promise<PetLibrary>
  selectImage: (id: string | null) => void
  deleteImage: (id: string) => void
  triggerAction: (action: string) => void
  logError: (message: string) => void
  onTriggerAction: (callback: (action: string) => void) => () => void
  onPetChanged: (callback: (pet: PetDescriptor | null) => void) => () => void
  onDefaultVideoActionsChanged: (callback: (actions: VideoActionDef[]) => void) => () => void
  onWindowMoved: (callback: () => void) => () => void
}

interface Window {
  desktopPet: DesktopPetApi
}
