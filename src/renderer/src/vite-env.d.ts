/// <reference types="vite/client" />

interface SystemInfo {
  platform: string
  appVersion: string
}

interface DesktopPetApi {
  getSystemInfo: () => Promise<SystemInfo>
  hide: () => void
  close: () => void
}

interface Window {
  desktopPet: DesktopPetApi
}
