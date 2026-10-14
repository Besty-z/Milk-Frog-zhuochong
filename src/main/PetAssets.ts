import { app, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { basename, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { sendToPet } from './PetWindow'
import { getHomeWindow } from './HomeWindow'

// PetAssets：管理桌宠图片库。负责——
// 1) 弹系统对话框选图（读成 data URL）
// 2) 把导入的图存进本地图片库（多张，持久化）
// 3) 记录「当前用哪张」，图片变化时通知桌宠窗口换图

interface PetImage {
  id: string
  name: string
  dataUrl: string
}

interface PetLibrary {
  images: PetImage[]
  currentId: string | null
}

let library: PetLibrary = { images: [], currentId: null }

function libraryFile(): string {
  return join(app.getPath('userData'), 'pet-library.json')
}

function legacyFile(): string {
  return join(app.getPath('userData'), 'current-pet.json')
}

function mimeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''

  switch (ext) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    default:
      return 'image/jpeg'
  }
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function loadLibrary() {
  const file = libraryFile()

  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<PetLibrary>

      if (Array.isArray(data.images)) {
        library.images = data.images.filter(
          (img): img is PetImage =>
            !!img && typeof img.id === 'string' && typeof img.name === 'string' && typeof img.dataUrl === 'string',
        )
      }

      if (typeof data.currentId === 'string' || data.currentId === null) {
        library.currentId = data.currentId
      }
      return
    } catch {
      // 文件损坏就当作空库
    }
  }

  // 迁移旧版本：以前只存一张图（current-pet.json），挪进新图片库
  const oldFile = legacyFile()
  if (existsSync(oldFile)) {
    try {
      const data = JSON.parse(readFileSync(oldFile, 'utf8')) as { dataUrl?: unknown }

      if (typeof data.dataUrl === 'string') {
        const img: PetImage = { id: generateId(), name: '已导入图片', dataUrl: data.dataUrl }
        library.images = [img]
        library.currentId = img.id
        persistLibrary()
      }
    } catch {
      // 忽略
    }
  }
}

function persistLibrary() {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(libraryFile(), JSON.stringify(library), 'utf8')
}

// 当前桌宠的 data URL；没有（null）表示用默认图
function currentDataUrl(): string | null {
  if (!library.currentId) {
    return null
  }

  const img = library.images.find((i) => i.id === library.currentId)
  return img ? img.dataUrl : null
}

function broadcastCurrent() {
  sendToPet('pet:image-changed', currentDataUrl())
}

function registerIpc() {
  ipcMain.handle('pet:choose-image', async () => {
    const options: OpenDialogOptions = {
      title: '选择桌宠图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
    }

    const parent = getHomeWindow()
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    const buffer = readFileSync(filePath)
    return {
      dataUrl: `data:${mimeFromPath(filePath)};base64,${buffer.toString('base64')}`,
      name: basename(filePath),
    }
  })

  ipcMain.on('pet:apply-image', (_event, arg: unknown) => {
    const { dataUrl, name } = (arg ?? {}) as { dataUrl?: unknown; name?: unknown }

    if (typeof dataUrl !== 'string') {
      return
    }

    const img: PetImage = {
      id: generateId(),
      name: typeof name === 'string' && name ? name : '未命名',
      dataUrl,
    }

    library.images.push(img)
    library.currentId = img.id
    persistLibrary()
    broadcastCurrent()
  })

  ipcMain.handle('pet:get-current-image', () => currentDataUrl())

  ipcMain.handle('pet:get-library', () => library)

  ipcMain.on('pet:select-image', (_event, id: unknown) => {
    if (id === null) {
      library.currentId = null
    } else if (typeof id === 'string' && library.images.some((i) => i.id === id)) {
      library.currentId = id
    } else {
      return
    }

    persistLibrary()
    broadcastCurrent()
  })

  ipcMain.on('pet:delete-image', (_event, id: unknown) => {
    if (typeof id !== 'string') {
      return
    }

    const index = library.images.findIndex((i) => i.id === id)

    if (index === -1) {
      return
    }

    library.images.splice(index, 1)

    // 删的是当前图 → 切到剩下的第一张，没有就回默认
    if (library.currentId === id) {
      library.currentId = library.images[0]?.id ?? null
    }

    persistLibrary()
    broadcastCurrent()
  })
}

export function initPetAssets() {
  loadLibrary()
  registerIpc()
}
