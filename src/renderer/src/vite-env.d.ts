/// <reference types="vite/client" />

interface SystemInfo {
  platform: string
  appVersion: string
}

interface DesktopPetApi {
  getSystemInfo: () => Promise<SystemInfo>
  hide: () => void
  show: () => void
  close: () => void
  setSize: (width: number, height: number) => void
  dragStart: () => void
  dragMove: () => void
  dragEnd: () => void
  setIgnoreMouse: (ignore: boolean) => void
  onWindowMoved: (callback: () => void) => () => void
}

interface Window {
  desktopPet: DesktopPetApi
}
