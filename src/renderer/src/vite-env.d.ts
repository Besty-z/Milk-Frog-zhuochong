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
  onWindowMoved: (callback: () => void) => () => void
}

interface Window {
  desktopPet: DesktopPetApi
}
