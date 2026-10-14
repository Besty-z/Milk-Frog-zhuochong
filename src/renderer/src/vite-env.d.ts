/// <reference types="vite/client" />

interface SystemInfo {
  platform: string
  appVersion: string
}

interface LibraryImage {
  id: string
  name: string
  dataUrl: string
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
  applyImage: (image: { dataUrl: string; name: string }) => void
  getCurrentImage: () => Promise<string | null>
  getLibrary: () => Promise<PetLibrary>
  selectImage: (id: string | null) => void
  deleteImage: (id: string) => void
  triggerAction: (action: string) => void
  onTriggerAction: (callback: (action: string) => void) => () => void
  onPetImageChanged: (callback: (dataUrl: string | null) => void) => () => void
  onWindowMoved: (callback: () => void) => () => void
}

interface Window {
  desktopPet: DesktopPetApi
}
