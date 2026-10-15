// web/bridge.ts
// 网页版「桥接层」：在浏览器里实现 window.desktopPet，让 App.tsx / HomeApp.tsx 完全原样复用。
//
// 桌面版里，App/HomeApp 通过 window.desktopPet 走 IPC 到主进程：读/写 JSON 文件、
// 控制窗口、弹文件框、跨窗口通信。网页版把这些能力替换成：
//   - 数据读写    → IndexedDB（对应桌面 userData 里的那几份 JSON 文件）
//   - 窗口控制    → 交给 WebApp 注册的「浮动桌宠控制器」操作 DOM
//   - 选文件      → <input type="file">
//   - 跨窗口通信  → 页面内事件总线
//
// 所有持久化逻辑（结构、默认值、版本、清洗）都和 src/main/PetAssets.ts 保持一致，
// 这样网页版和桌面版的用户数据在语义上完全对得上。

// —— IndexedDB 极简 KV ——
const DB_NAME = 'milk-frog-pet-web'
const DB_VERSION = 1
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('打开 IndexedDB 失败'))
  })

  return dbPromise
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    // 写入失败（比如隐私模式禁用了 IndexedDB）不致命，只记录，保证页面还能用
    console.error('[桌宠] 保存到本地失败：', err)
  }
}

// 深拷贝：模拟 IPC 序列化，让 getter 每次都返回「新对象」，
// React 才能感知到变化并重新渲染（否则同一个引用 setState 不会触发）。
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// —— 页面内事件总线（对应桌面版的跨窗口广播）——
type Listener = (payload: unknown) => void
const listeners = new Map<string, Set<Listener>>()

function on(type: string, cb: Listener): () => void {
  let set = listeners.get(type)
  if (!set) {
    set = new Set()
    listeners.set(type, set)
  }
  set.add(cb)
  return () => {
    set.delete(cb)
  }
}

function emit(type: string, payload?: unknown): void {
  listeners.get(type)?.forEach((cb) => cb(payload))
}

// —— 持久化 key（和桌面版 JSON 文件名一一对应）——
const KEY_LIBRARY = 'library'
const KEY_DEFAULT_CUTOUT = 'default-cutout'
const KEY_POSE_CUTOUTS = 'pose-cutouts'
const KEY_STATIC_CONFIGS = 'static-action-configs'
const KEY_AUTO_LAUGH = 'auto-laugh-config'
const KEY_BUILTIN_CONFIG = 'builtin-video-action-config'
const KEY_DEFAULT_VIDEO_ACTIONS = 'default-video-actions'

// 和 PetAssets.ts 里的版本号一致：换图/换素材时 +1，旧缓存自动失效
const DEFAULT_CUTOUT_VERSION = 2
const POSE_CUTOUT_VERSION = 1

// —— 内存状态（和主进程的 module 级变量一致）——
let library: PetLibrary = { images: [], currentId: null }
let defaultCutout: string | null = null
let poseCutouts: Record<string, string> = {}
let staticConfigs: Record<string, StaticActionConfig> = {}
let autoLaughConfig: AutoLaughConfig = { enabled: true, everyNActions: 3 }
let builtinConfig: BuiltinVideoActionConfig = { enabled: {} }
let defaultVideoActions: VideoActionDef[] = []

// —— 校验工具（从 PetAssets.ts 移植）——
const STATIC_ACTION_TRIGGERS = new Set(['manual', 'click', 'double', 'dragStart', 'dragEnd', 'idleRandom'])

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
    typeof d.loop === 'boolean' &&
    (d.enabled === undefined || typeof d.enabled === 'boolean')
  )
}

function isStaticActionConfig(value: unknown): value is StaticActionConfig {
  const c = value as StaticActionConfig
  return (
    !!value &&
    typeof c.trigger === 'string' &&
    STATIC_ACTION_TRIGGERS.has(c.trigger) &&
    typeof c.equipped === 'boolean' &&
    typeof c.durationMs === 'number' &&
    typeof c.speed === 'number' &&
    typeof c.cooldownMs === 'number'
  )
}

function cleanStaticActionConfigs(raw: unknown): Record<string, StaticActionConfig> {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  const out: Record<string, StaticActionConfig> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isStaticActionConfig(value)) {
      out[key] = value
    }
  }
  return out
}

function isAutoLaughConfig(value: unknown): value is AutoLaughConfig {
  const c = value as AutoLaughConfig
  return (
    !!value &&
    typeof c.enabled === 'boolean' &&
    typeof c.everyNActions === 'number' &&
    Number.isFinite(c.everyNActions) &&
    c.everyNActions >= 1
  )
}

function cleanBuiltinVideoActionConfig(raw: unknown): BuiltinVideoActionConfig {
  const enabled: Record<string, boolean> = {}
  if (raw && typeof raw === 'object') {
    const source = (raw as { enabled?: unknown }).enabled
    if (source && typeof source === 'object') {
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        if (typeof key === 'string' && typeof value === 'boolean') {
          enabled[key] = value
        }
      }
    }
  }
  return { enabled }
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function makeStaticImage(name: string, dataUrl: string): LibraryImage {
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
    return {
      kind: 'video',
      id: img.id,
      dataUrl: img.dataUrl,
      width: img.width,
      height: img.height,
      videoActions: img.videoActions,
    }
  }

  return { kind: 'image', id: img.id, dataUrl: img.dataUrl, videoActions: img.videoActions }
}

function broadcastCurrent(): void {
  emit('current-changed', currentDescriptor())
}

function persistLibrary(): void {
  void idbSet(KEY_LIBRARY, library)
}

// —— 加载全部持久化状态（启动时一次）——
async function loadAll(): Promise<void> {
  const rawLibrary = await idbGet<PetLibrary>(KEY_LIBRARY)
  if (rawLibrary && Array.isArray(rawLibrary.images)) {
    library = rawLibrary
    if (typeof rawLibrary.currentId !== 'string') {
      library.currentId = null
    }
  }

  const rawCutout = await idbGet<{ version?: unknown; dataUrl?: unknown }>(KEY_DEFAULT_CUTOUT)
  if (rawCutout && rawCutout.version === DEFAULT_CUTOUT_VERSION && typeof rawCutout.dataUrl === 'string') {
    defaultCutout = rawCutout.dataUrl
  }

  const rawPose = await idbGet<{ version?: unknown; cutouts?: unknown }>(KEY_POSE_CUTOUTS)
  if (rawPose && rawPose.version === POSE_CUTOUT_VERSION && rawPose.cutouts && typeof rawPose.cutouts === 'object') {
    poseCutouts = {}
    for (const [key, value] of Object.entries(rawPose.cutouts as Record<string, unknown>)) {
      if (typeof value === 'string') {
        poseCutouts[key] = value
      }
    }
  }

  const rawConfigs = await idbGet<Record<string, unknown>>(KEY_STATIC_CONFIGS)
  if (rawConfigs && typeof rawConfigs === 'object') {
    staticConfigs = cleanStaticActionConfigs(rawConfigs)
  }

  const rawLaugh = await idbGet<AutoLaughConfig>(KEY_AUTO_LAUGH)
  if (isAutoLaughConfig(rawLaugh)) {
    autoLaughConfig = rawLaugh
  }

  const rawBuiltin = await idbGet<BuiltinVideoActionConfig>(KEY_BUILTIN_CONFIG)
  if (rawBuiltin) {
    builtinConfig = cleanBuiltinVideoActionConfig(rawBuiltin)
  }

  const rawVideoActions = await idbGet<{ actions?: unknown }>(KEY_DEFAULT_VIDEO_ACTIONS)
  if (rawVideoActions && Array.isArray(rawVideoActions.actions)) {
    defaultVideoActions = rawVideoActions.actions.filter(
      (a): a is VideoActionDef => isVideoActionDef(a) && a.dataUrl.startsWith('data:'),
    )
  }
}

// —— 文件选择（对应桌面的系统对话框）——
function pickFile(accept: string): Promise<{ dataUrl: string; name: string } | null> {
  return new Promise((resolve) => {
    let settled = false
    const input = document.createElement('input')

    const onFocus = (): void => {
      // 兜底：某些老浏览器不触发 input 的 cancel 事件，等对话框关闭、窗口重新聚焦后视为取消
      window.setTimeout(() => done(null), 300)
    }
    const cleanup = (): void => window.removeEventListener('focus', onFocus)
    const done = (value: { dataUrl: string; name: string } | null): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(value)
    }

    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        done(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => done({ dataUrl: reader.result as string, name: file.name })
      reader.onerror = () => done(null)
      reader.readAsDataURL(file)
    })
    input.addEventListener('cancel', () => done(null))
    window.addEventListener('focus', onFocus)
    input.click()
  })
}

// —— 浮动桌宠控制器：由 WebApp 注册，桥接到 DOM ——
export interface PetController {
  setSize: (width: number, height: number) => void
  dragStart: (screenX: number, screenY: number) => void
  dragMove: (screenX: number, screenY: number) => void
  dragEnd: () => void
  hide: () => void
  show: () => void
}

let controller: PetController | null = null

export function attachPetController(next: PetController | null): void {
  controller = next
}

// —— 组装 window.desktopPet ——
function createApi(): DesktopPetApi {
  return {
    getSystemInfo: () => Promise.resolve({ platform: 'web', appVersion: 'web-0.1.0' }),

    // 窗口控制（网页版操作浮动桌宠 DOM）
    setSize: (width, height) => controller?.setSize(width, height),
    dragStart: (screenX, screenY) => controller?.dragStart(screenX, screenY),
    dragMove: (screenX, screenY) => controller?.dragMove(screenX, screenY),
    dragEnd: () => controller?.dragEnd(),
    hide: () => controller?.hide(),
    show: () => controller?.show(),
    close: () => controller?.hide(),
    setIgnoreMouse: () => {
      // 桌面版的「点击穿透」概念在网页上不存在，网页版希望点角色就有反应
    },

    // 文件选择
    chooseImage: () =>
      pickFile('image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime'),
    chooseVideo: () => pickFile('video/mp4,video/webm,video/quicktime'),
    chooseAudio: () => pickFile('audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac'),

    // 导入
    applyImage: (image) => {
      if (typeof image.dataUrl !== 'string') {
        return
      }
      const img = makeStaticImage(
        typeof image.name === 'string' && image.name ? image.name : '未命名',
        image.dataUrl,
      )
      library.images.push(img)
      library.currentId = img.id
      persistLibrary()
      broadcastCurrent()
    },
    applyGif: (gif) => {
      if (!Array.isArray(gif.frames) || gif.frames.length === 0) {
        return
      }
      const img: LibraryImage = {
        id: generateId(),
        name: typeof gif.name === 'string' && gif.name ? gif.name : '未命名',
        kind: 'gif',
        dataUrl: '',
        frames: gif.frames.filter((f): f is string => typeof f === 'string'),
        delays: Array.isArray(gif.delays) ? gif.delays.map((d) => (typeof d === 'number' ? d : 100)) : [],
        width: typeof gif.width === 'number' ? gif.width : 0,
        height: typeof gif.height === 'number' ? gif.height : 0,
        alphaDataUrl: typeof gif.alphaDataUrl === 'string' ? gif.alphaDataUrl : '',
        actions: [],
        videoActions: [],
      }
      library.images.push(img)
      library.currentId = img.id
      persistLibrary()
      broadcastCurrent()
    },
    applyVideo: (video) => {
      if (typeof video.dataUrl !== 'string') {
        return
      }
      const img: LibraryImage = {
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
    },
    updateGifActions: (arg) => {
      const { id, actions } = arg
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
    },

    // 动作视频
    applyVideoAction: (arg) => {
      const { id, action } = arg
      if (!isVideoActionDef(action)) {
        return
      }
      if (id === null) {
        defaultVideoActions = [...defaultVideoActions, action]
        void idbSet(KEY_DEFAULT_VIDEO_ACTIONS, { actions: defaultVideoActions })
        emit('default-video-actions-changed', clone(defaultVideoActions))
        return
      }
      const img = library.images.find((i) => i.id === id)
      if (!img) {
        return
      }
      img.videoActions.push(action)
      persistLibrary()
      broadcastCurrent()
    },
    updateVideoActions: (arg) => {
      const { id, actions } = arg
      if (!Array.isArray(actions)) {
        return
      }
      const next = actions.filter(isVideoActionDef)
      if (id === null) {
        defaultVideoActions = next
        void idbSet(KEY_DEFAULT_VIDEO_ACTIONS, { actions: defaultVideoActions })
        emit('default-video-actions-changed', clone(defaultVideoActions))
        return
      }
      const img = library.images.find((i) => i.id === id)
      if (!img) {
        return
      }
      img.videoActions = next
      persistLibrary()
      broadcastCurrent()
    },
    getDefaultVideoActions: () => Promise.resolve(clone(defaultVideoActions)),

    // 当前桌宠 / 图库
    getCurrentPet: () => Promise.resolve(currentDescriptor()),
    getLibrary: () => Promise.resolve(clone(library)),
    selectImage: (id) => {
      if (id === null) {
        library.currentId = null
      } else if (typeof id === 'string' && library.images.some((i) => i.id === id)) {
        library.currentId = id
      } else {
        return
      }
      persistLibrary()
      broadcastCurrent()
    },
    deleteImage: (id) => {
      if (typeof id !== 'string') {
        return
      }
      const index = library.images.findIndex((i) => i.id === id)
      if (index === -1) {
        return
      }
      library.images.splice(index, 1)
      if (library.currentId === id) {
        library.currentId = library.images[0]?.id ?? null
      }
      persistLibrary()
      broadcastCurrent()
    },
    renameImage: (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) {
        return
      }
      const img = library.images.find((i) => i.id === id)
      if (!img) {
        return
      }
      img.name = trimmed
      persistLibrary()
    },

    // 默认图抠图缓存
    getDefaultCutout: () => Promise.resolve(defaultCutout),
    saveDefaultCutout: (dataUrl) => {
      if (typeof dataUrl === 'string' && dataUrl) {
        defaultCutout = dataUrl
        void idbSet(KEY_DEFAULT_CUTOUT, { version: DEFAULT_CUTOUT_VERSION, dataUrl })
      }
    },

    // 姿势抠图缓存
    getCutout: (key) => Promise.resolve(typeof key === 'string' ? (poseCutouts[key] ?? null) : null),
    saveCutout: (key, dataUrl) => {
      if (typeof key === 'string' && key && typeof dataUrl === 'string' && dataUrl) {
        poseCutouts[key] = dataUrl
        void idbSet(KEY_POSE_CUTOUTS, { version: POSE_CUTOUT_VERSION, cutouts: poseCutouts })
      }
    },

    // 静态姿势动作配置
    getStaticActionConfigs: () => Promise.resolve(clone(staticConfigs)),
    saveStaticActionConfigs: (configs) => {
      const cleaned = cleanStaticActionConfigs(configs)
      staticConfigs = cleaned
      void idbSet(KEY_STATIC_CONFIGS, cleaned)
      emit('static-action-configs-changed', clone(cleaned))
    },

    // 自动捧腹大笑规则
    getAutoLaughConfig: () => Promise.resolve(clone(autoLaughConfig)),
    saveAutoLaughConfig: (config) => {
      if (!isAutoLaughConfig(config)) {
        return
      }
      autoLaughConfig = config
      void idbSet(KEY_AUTO_LAUGH, config)
      emit('auto-laugh-config-changed', clone(config))
    },

    // 内置动作视频「应用」开关
    getBuiltinVideoActionConfig: () => Promise.resolve(clone(builtinConfig)),
    saveBuiltinVideoActionConfig: (config) => {
      const cleaned = cleanBuiltinVideoActionConfig(config)
      builtinConfig = cleaned
      void idbSet(KEY_BUILTIN_CONFIG, cleaned)
      emit('builtin-video-action-config-changed', clone(cleaned))
    },

    // 跨「窗口」通信
    triggerAction: (action) => emit('trigger-action', action),
    logError: (message) => console.error('[桌宠]', message),

    // 订阅
    onTriggerAction: (callback) => on('trigger-action', (p) => callback(p as string)),
    onPetChanged: (callback) => on('current-changed', (p) => callback(p as PetDescriptor | null)),
    onDefaultVideoActionsChanged: (callback) =>
      on('default-video-actions-changed', (p) => callback(p as VideoActionDef[])),
    onStaticActionConfigsChanged: (callback) =>
      on('static-action-configs-changed', (p) => callback(p as Record<string, StaticActionConfig>)),
    onAutoLaughConfigChanged: (callback) =>
      on('auto-laugh-config-changed', (p) => callback(p as AutoLaughConfig)),
    onBuiltinVideoActionConfigChanged: (callback) =>
      on('builtin-video-action-config-changed', (p) => callback(p as BuiltinVideoActionConfig)),
    onWindowMoved: () => () => {},
  }
}

export async function initWebBridge(): Promise<void> {
  try {
    await loadAll()
  } catch (err) {
    // 读取失败（IndexedDB 不可用等）就退回默认配置，避免白屏
    console.error('[桌宠] 读取本地数据失败，使用默认配置：', err)
  }
  window.desktopPet = createApi()
}
