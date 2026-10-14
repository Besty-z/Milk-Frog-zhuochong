import { app, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { basename, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { sendToPet } from './PetWindow'
import { getHomeWindow } from './HomeWindow'

// PetAssets：管理桌宠图片库。负责——
// 1) 弹系统对话框选图（读成 data URL）
// 2) 把导入的图存进本地图片库（多张，持久化）
// 3) 记录「当前用哪张」，图片变化时通知桌宠窗口换图

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

interface PetImage {
  id: string
  name: string
  kind: 'image' | 'gif' | 'video'
  dataUrl: string // 静态图/视频用；动图导入时已解码成帧，这里留空
  frames: string[] // 动图：裁好包围盒的帧
  delays: number[] // 动图：每帧延迟（毫秒）
  width: number // 动图：裁剪后宽
  height: number // 动图：裁剪后高
  alphaDataUrl: string // 动图：点击穿透用的并集 alpha 图
  actions: PetActionDef[] // 动图：动作
  videoActions: VideoActionDef[] // 动作视频片段（每只桌宠各自独立）
}

// 「当前桌宠」的描述：静态图、动图或整段视频。发给渲染进程时用它替换原来的 dataUrl|null。
type PetDescriptor =
  | { kind: 'image'; id: string; dataUrl: string; videoActions: VideoActionDef[] }
  | { kind: 'gif'; id: string; frames: string[]; delays: number[]; width: number; height: number; alphaDataUrl: string; actions: PetActionDef[]; videoActions: VideoActionDef[] }
  | { kind: 'video'; id: string; dataUrl: string; width: number; height: number; videoActions: VideoActionDef[] }

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

function defaultCutoutFile(): string {
  return join(app.getPath('userData'), 'default-pet-cutout.json')
}

// 默认图的「抠图结果」缓存：第一次抠好后存这里，以后直接读，不用再联网抠。
// 换默认图（src/renderer/src/assets/pet.jpg）时把 DEFAULT_CUTOUT_VERSION +1，
// 旧缓存会因版本不符自动失效，重新抠新图。
const DEFAULT_CUTOUT_VERSION = 2

function readDefaultCutout(): string | null {
  const file = defaultCutoutFile()

  if (!existsSync(file)) {
    return null
  }

  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown; dataUrl?: unknown }
    if (data.version !== DEFAULT_CUTOUT_VERSION) {
      return null
    }
    return typeof data.dataUrl === 'string' ? data.dataUrl : null
  } catch {
    return null
  }
}

function saveDefaultCutout(dataUrl: string) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(defaultCutoutFile(), JSON.stringify({ version: DEFAULT_CUTOUT_VERSION, dataUrl }), 'utf8')
}

// 默认奶娃（不在图库里）自己的动作视频列表，单独存一份，和抠图缓存一个套路。
function defaultVideoActionsFile(): string {
  return join(app.getPath('userData'), 'default-pet-video-actions.json')
}

function readDefaultVideoActions(): VideoActionDef[] {
  const file = defaultVideoActionsFile()

  if (!existsSync(file)) {
    return []
  }

  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as { actions?: unknown }
    return Array.isArray(data.actions) ? data.actions.filter(isVideoActionDef) : []
  } catch {
    return []
  }
}

function saveDefaultVideoActions(actions: VideoActionDef[]) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(defaultVideoActionsFile(), JSON.stringify({ actions }), 'utf8')
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
    case 'mp4':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mov':
      return 'video/quicktime'
    default:
      return 'image/jpeg'
  }
}

function audioMimeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''

  switch (ext) {
    case 'wav':
      return 'audio/wav'
    case 'ogg':
      return 'audio/ogg'
    case 'm4a':
      return 'audio/mp4'
    case 'aac':
      return 'audio/aac'
    default:
      return 'audio/mpeg'
  }
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isActionDef(a: unknown): a is PetActionDef {
  const d = a as PetActionDef
  return (
    !!a &&
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    typeof d.startFrame === 'number' &&
    typeof d.endFrame === 'number' &&
    typeof d.loop === 'boolean' &&
    (d.soundDataUrl === undefined || typeof d.soundDataUrl === 'string')
  )
}

function isVideoActionDef(a: unknown): a is VideoActionDef {
  const d = a as VideoActionDef
  return (
    !!a &&
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    typeof d.dataUrl === 'string' &&
    typeof d.loop === 'boolean'
  )
}

function makeStaticImage(name: string, dataUrl: string): PetImage {
  return {
    id: generateId(),
    name,
    kind: 'image',
    dataUrl,
    frames: [],
    delays: [],
    width: 0,
    height: 0,
    alphaDataUrl: '',
    actions: [],
    videoActions: [],
  }
}

function loadLibrary() {
  const file = libraryFile()

  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<PetLibrary>

      if (Array.isArray(data.images)) {
        library.images = data.images
          .map((raw): PetImage | null => {
            const img = raw as Partial<PetImage> | null | undefined

            if (!img || typeof img.id !== 'string' || typeof img.name !== 'string') {
              return null
            }

            const kind = img.kind === 'gif' ? 'gif' : img.kind === 'video' ? 'video' : 'image'
            const actions = Array.isArray(img.actions) ? img.actions.filter(isActionDef) : []
            const videoActions = Array.isArray(img.videoActions) ? img.videoActions.filter(isVideoActionDef) : []

            if (kind === 'gif') {
              // 动图必须已存好解码后的帧；旧版本存的是原始 GIF dataUrl（主进程没法解帧），直接丢弃
              if (
                Array.isArray(img.frames) &&
                Array.isArray(img.delays) &&
                typeof img.width === 'number' &&
                typeof img.height === 'number' &&
                typeof img.alphaDataUrl === 'string'
              ) {
                return {
                  id: img.id,
                  name: img.name,
                  kind,
                  dataUrl: '',
                  frames: img.frames.filter((f): f is string => typeof f === 'string'),
                  delays: img.delays.map((d) => (typeof d === 'number' ? d : 100)),
                  width: img.width,
                  height: img.height,
                  alphaDataUrl: img.alphaDataUrl,
                  actions,
                  videoActions,
                }
              }

              return null
            }

            if (kind === 'video') {
              if (typeof img.dataUrl !== 'string' || typeof img.width !== 'number' || typeof img.height !== 'number') {
                return null
              }

              return {
                id: img.id,
                name: img.name,
                kind,
                dataUrl: img.dataUrl,
                frames: [],
                delays: [],
                width: img.width,
                height: img.height,
                alphaDataUrl: '',
                actions,
                videoActions,
              }
            }

            if (typeof img.dataUrl !== 'string') {
              return null
            }

            return {
              id: img.id,
              name: img.name,
              kind,
              dataUrl: img.dataUrl,
              frames: [],
              delays: [],
              width: 0,
              height: 0,
              alphaDataUrl: '',
              actions,
              videoActions,
            }
          })
          .filter((img): img is PetImage => img !== null)
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
        const img = makeStaticImage('已导入图片', data.dataUrl)
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

// 当前桌宠的描述；null 表示用默认图
function currentDescriptor(): PetDescriptor | null {
  if (!library.currentId) {
    return null
  }

  const img = library.images.find((i) => i.id === library.currentId)

  if (!img) {
    return null
  }

  if (img.kind === 'gif') {
    return {
      kind: 'gif',
      id: img.id,
      frames: img.frames,
      delays: img.delays,
      width: img.width,
      height: img.height,
      alphaDataUrl: img.alphaDataUrl,
      actions: img.actions,
      videoActions: img.videoActions,
    }
  }

  if (img.kind === 'video') {
    return { kind: 'video', id: img.id, dataUrl: img.dataUrl, width: img.width, height: img.height, videoActions: img.videoActions }
  }

  return { kind: 'image', id: img.id, dataUrl: img.dataUrl, videoActions: img.videoActions }
}

function broadcastCurrent() {
  sendToPet('pet:current-changed', currentDescriptor())
}

function registerIpc() {
  ipcMain.handle('pet:choose-image', async () => {
    const options: OpenDialogOptions = {
      title: '选择桌宠图片',
      properties: ['openFile'],
      filters: [{ name: '图片 / 动图 / 视频', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov'] }],
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

  ipcMain.handle('pet:choose-audio', async () => {
    const options: OpenDialogOptions = {
      title: '选择声音文件',
      properties: ['openFile'],
      filters: [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] }],
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
      dataUrl: `data:${audioMimeFromPath(filePath)};base64,${buffer.toString('base64')}`,
      name: basename(filePath),
    }
  })

  ipcMain.on('pet:apply-image', (_event, arg: unknown) => {
    const { dataUrl, name } = (arg ?? {}) as { dataUrl?: unknown; name?: unknown }

    if (typeof dataUrl !== 'string') {
      return
    }

    const img = makeStaticImage(typeof name === 'string' && name ? name : '未命名', dataUrl)

    library.images.push(img)
    library.currentId = img.id
    persistLibrary()
    broadcastCurrent()
  })

  ipcMain.on('pet:apply-gif', (_event, arg: unknown) => {
    const gif = (arg ?? {}) as {
      name?: unknown
      frames?: unknown
      delays?: unknown
      width?: unknown
      height?: unknown
      alphaDataUrl?: unknown
    }

    if (!Array.isArray(gif.frames) || gif.frames.length === 0) {
      return
    }

    const img: PetImage = {
      id: generateId(),
      name: typeof gif.name === 'string' && gif.name ? gif.name : '未命名',
      kind: 'gif',
      dataUrl: '',
      frames: gif.frames.filter((f): f is string => typeof f === 'string'),
      delays: Array.isArray(gif.delays) ? gif.delays.map((d) => (typeof d === 'number' ? d : 100)) : [],
      width: typeof gif.width === 'number' ? gif.width : 0,
      height: typeof gif.height === 'number' ? gif.height : 0,
      alphaDataUrl: typeof gif.alphaDataUrl === 'string' ? gif.alphaDataUrl : '',
      // 动作先留空：默认「整段循环」就是待机，具体动作由用户自己框帧创建
      actions: [],
      videoActions: [],
    }

    library.images.push(img)
    library.currentId = img.id
    persistLibrary()
    broadcastCurrent()
  })

  ipcMain.on('pet:apply-video', (_event, arg: unknown) => {
    const video = (arg ?? {}) as { name?: unknown; dataUrl?: unknown; width?: unknown; height?: unknown }

    if (typeof video.dataUrl !== 'string') {
      return
    }

    const img: PetImage = {
      id: generateId(),
      name: typeof video.name === 'string' && video.name ? video.name : '未命名',
      kind: 'video',
      dataUrl: video.dataUrl,
      frames: [],
      delays: [],
      width: typeof video.width === 'number' ? video.width : 0,
      height: typeof video.height === 'number' ? video.height : 0,
      alphaDataUrl: '',
      actions: [],
      videoActions: [],
    }

    library.images.push(img)
    library.currentId = img.id
    persistLibrary()
    broadcastCurrent()
  })

  ipcMain.on('pet:update-gif-actions', (_event, arg: unknown) => {
    const { id, actions } = (arg ?? {}) as { id?: unknown; actions?: unknown }

    if (typeof id !== 'string' || !Array.isArray(actions)) {
      return
    }

    const img = library.images.find((i) => i.id === id)

    if (!img || img.kind !== 'gif') {
      return
    }

    img.actions = actions.filter(isActionDef)

    persistLibrary()
    broadcastCurrent()
  })

  ipcMain.handle('pet:choose-video', async () => {
    const options: OpenDialogOptions = {
      title: '选择动作视频',
      properties: ['openFile'],
      filters: [{ name: '视频', extensions: ['mp4', 'webm', 'mov'] }],
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

  ipcMain.on('pet:apply-video-action', (_event, arg: unknown) => {
    const { id, action } = (arg ?? {}) as { id?: unknown; action?: unknown }

    if (!isVideoActionDef(action)) {
      return
    }

    if (id === null) {
      saveDefaultVideoActions([...readDefaultVideoActions(), action])
      sendToPet('pet:default-video-actions-changed', readDefaultVideoActions())
      return
    }

    const img = library.images.find((i) => i.id === id)

    if (!img) {
      return
    }

    img.videoActions.push(action)
    persistLibrary()
    broadcastCurrent()
  })

  ipcMain.on('pet:update-video-actions', (_event, arg: unknown) => {
    const { id, actions } = (arg ?? {}) as { id?: unknown; actions?: unknown }

    if (!Array.isArray(actions)) {
      return
    }

    const next = actions.filter(isVideoActionDef)

    if (id === null) {
      saveDefaultVideoActions(next)
      sendToPet('pet:default-video-actions-changed', next)
      return
    }

    const img = library.images.find((i) => i.id === id)

    if (!img) {
      return
    }

    img.videoActions = next
    persistLibrary()
    broadcastCurrent()
  })

  ipcMain.handle('pet:get-default-video-actions', () => readDefaultVideoActions())

  ipcMain.handle('pet:get-current-pet', () => currentDescriptor())

  ipcMain.handle('pet:get-default-cutout', () => readDefaultCutout())

  ipcMain.on('pet:save-default-cutout', (_event, dataUrl: unknown) => {
    if (typeof dataUrl === 'string' && dataUrl) {
      saveDefaultCutout(dataUrl)
    }
  })

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
