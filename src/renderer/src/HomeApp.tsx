import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDefaultPetImage } from './modules/AssetManager'
import { cutoutFrames, cutoutImage } from './modules/BackgroundRemoval'
import {
  cropGifFrames,
  decodeGifFrames,
  downscaleDataUrl,
  framesWithDelays,
  type GifFrames,
} from './modules/GifDecoder'
import { GifPlayer } from './modules/GifPlayer'
import { DEFAULT_ACTION_CONFIG, STATIC_POSE_ACTIONS, type StaticAction } from './modules/PoseActions'
import { BUILTIN_DEFAULT_VIDEO_ACTIONS, isBuiltinVideoAction } from './modules/DefaultPetActions'
import { Icon, type IconName } from './modules/HomeIcons'
import laughSound from './assets/laugh.mp3'
import './home.css'

// HomeApp：桌宠「首页」。三个标签页：导入 / 动作 / 桌宠样式。
// 「动作」页：当前是动图时，提供帧进度条 + 动作编辑器，每个动作还能在主页里直接看预览。

type Tab = 'import' | 'action' | 'style'

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'import', label: '导入', icon: 'upload' },
  { key: 'action', label: '动作', icon: 'zap' },
  { key: 'style', label: '桌宠样式', icon: 'grid' },
]

const BUILTIN_ACTIONS: { key: string; label: string; desc: string; icon: IconName }[] = [
  { key: 'idle', label: '待机', desc: '停止当前动作，回到待机状态', icon: 'pause' },
  { key: 'happy', label: '开心', desc: '开心地跳两下', icon: 'smile' },
  { key: 'spin', label: '360° 旋转', desc: '高速连续旋转约 5 秒后停回原位', icon: 'rotate' },
]

const STATIC_TRIGGER_OPTIONS: { value: StaticActionTrigger; label: string }[] = [
  { value: 'manual', label: '手动触发' },
  { value: 'click', label: '单击' },
  { value: 'double', label: '双击' },
  { value: 'dragStart', label: '开始拖动' },
  { value: 'dragEnd', label: '停止拖动' },
  { value: 'idleRandom', label: '空闲随机' },
]

function isGifDataUrl(dataUrl: string): boolean {
  return dataUrl.startsWith('data:image/gif')
}

function isVideoDataUrl(dataUrl: string): boolean {
  return dataUrl.startsWith('data:video/')
}

function generateActionId(): string {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function playSound(dataUrl: string) {
  const audio = new Audio(dataUrl)
  void audio.play().catch(() => {})
}

// 把打包进去的资源（URL）读成 dataURL，存进动作里才能自包含、跨重启不失效。
async function fetchAsDataUrl(url: string): Promise<string> {
  const resp = await fetch(url)
  const blob = await resp.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取音频失败'))
    reader.readAsDataURL(blob)
  })
}

// 读视频的宽高（loadedmetadata 后 videoWidth/videoHeight 才有值）
function videoSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight })
    video.onerror = () => reject(new Error('读取视频失败'))
    video.src = dataUrl
  })
}

function HomeApp() {
  const [tab, setTab] = useState<Tab>('import')
  const [picked, setPicked] = useState<{ dataUrl: string; name: string } | null>(null)
  // 导入时给新桌宠起的名字（默认用文件名，可改）
  const [petName, setPetName] = useState('')
  const [busy, setBusy] = useState(false)
  const [cutting, setCutting] = useState(false)
  const [cutoutMsg, setCutoutMsg] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  // 动作编辑器里「待添加」的声音（选好后跟着下一个动作一起存）
  const [pendingSound, setPendingSound] = useState<{ dataUrl: string; name: string } | null>(null)
  const [library, setLibrary] = useState<PetLibrary>({ images: [], currentId: null })
  // 样式页「重命名」：正在重命名的条目 id + 输入框里的新名字
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // 默认桌宠的缩略图：有抠图缓存就用透明版，否则显示原图
  const [defaultThumb, setDefaultThumb] = useState<string>(getDefaultPetImage)

  // 当前桌宠（动作页用）+ 导入页选中的动图（解码后的原始帧）
  const [currentPet, setCurrentPet] = useState<PetDescriptor | null>(null)
  const [importGif, setImportGif] = useState<GifFrames | null>(null)

  // 动作编辑器状态
  const [actions, setActions] = useState<PetActionDef[]>([])
  const [scrubFrame, setScrubFrame] = useState(0)
  const [selStart, setSelStart] = useState(0)
  const [selEnd, setSelEnd] = useState(0)
  const [actionName, setActionName] = useState('')
  const [actionLoop, setActionLoop] = useState(true)

  // 动作视频片段：默认奶娃自己的动作列表 + 「待添加」的本地视频
  const [defaultVideoActions, setDefaultVideoActions] = useState<VideoActionDef[]>([])
  const [pickedVideoAction, setPickedVideoAction] = useState<{ dataUrl: string; name: string } | null>(null)
  const [videoActionName, setVideoActionName] = useState('')
  const [videoActionLoop, setVideoActionLoop] = useState(true)
  // 静态动作配置：从 main 进程读，变更时跟随（装备/触发/时长/速度/冷却）
  const [staticConfigs, setStaticConfigs] = useState<Record<string, StaticActionConfig>>({})
  // 自动捧腹大笑规则：每 N 次动作自动播一次
  const [autoLaughConfig, setAutoLaughConfig] = useState<AutoLaughConfig>({ enabled: true, everyNActions: 3 })
  // 内置动作视频（捧腹大笑）的「应用」开关：按 id 存，缺省 = 启用
  const [builtinVideoActionConfig, setBuiltinVideoActionConfig] = useState<BuiltinVideoActionConfig>({
    enabled: {},
  })

  const refreshLibrary = useCallback(() => {
    void window.desktopPet.getLibrary().then(setLibrary)
  }, [])

  useEffect(() => {
    refreshLibrary()
  }, [refreshLibrary])

  useEffect(() => {
    void window.desktopPet.getDefaultCutout().then((cached) => {
      if (cached) {
        setDefaultThumb(cached)
      }
    })
  }, [])

  // 默认奶娃的动作视频列表：启动读一次 + 变更时跟随
  useEffect(() => {
    void window.desktopPet.getDefaultVideoActions().then(setDefaultVideoActions)
    return window.desktopPet.onDefaultVideoActionsChanged(setDefaultVideoActions)
  }, [])

  // 静态动作配置：启动读一次 + 变更时跟随（两个窗口都订阅，改动实时同步）
  useEffect(() => {
    void window.desktopPet.getStaticActionConfigs().then(setStaticConfigs)
    return window.desktopPet.onStaticActionConfigsChanged(setStaticConfigs)
  }, [])

  // 自动捧腹大笑规则：启动读一次 + 变更时跟随
  useEffect(() => {
    void window.desktopPet.getAutoLaughConfig().then(setAutoLaughConfig)
    return window.desktopPet.onAutoLaughConfigChanged(setAutoLaughConfig)
  }, [])

  // 内置动作视频「应用」开关：启动读一次 + 变更时跟随
  useEffect(() => {
    void window.desktopPet.getBuiltinVideoActionConfig().then(setBuiltinVideoActionConfig)
    return window.desktopPet.onBuiltinVideoActionConfigChanged(setBuiltinVideoActionConfig)
  }, [])

  // 当前桌宠：选择变化时重新拉一次
  useEffect(() => {
    void window.desktopPet.getCurrentPet().then(setCurrentPet)
  }, [library.currentId])

  // 动作列表跟随当前动图（编辑动作后主进程会广播回来，这里同步进编辑器）
  useEffect(() => {
    setActions(currentPet?.kind === 'gif' ? currentPet.actions : [])
    setPendingSound(null)
  }, [currentPet])

  // 当前动图的帧（导入时已解码好）；用 id 做 key，动作编辑不会重建帧
  const currentGifFrames = useMemo(
    () => (currentPet?.kind === 'gif' ? framesWithDelays(currentPet.frames, currentPet.delays) : null),
    [currentPet?.id],
  )

  // 当前桌宠的动作视频列表：默认奶娃用「自带捧腹大笑 + 用户导入的默认动作」，导入的桌宠用条目里的 videoActions
  // 内置动作的「应用」开关从 builtinVideoActionConfig 读（缺省启用）。
  const currentVideoActions = currentPet
    ? (currentPet.videoActions ?? [])
    : [
        ...BUILTIN_DEFAULT_VIDEO_ACTIONS.map((a) => ({
          ...a,
          enabled: builtinVideoActionConfig.enabled[a.id] ?? true,
        })),
        ...defaultVideoActions,
      ]

  // 静态动作：基础信息 + 用户配置合并
  const staticActions = useMemo<StaticAction[]>(
    () =>
      STATIC_POSE_ACTIONS.map((base) => ({
        ...base,
        ...DEFAULT_ACTION_CONFIG,
        ...(staticConfigs[base.id] ?? {}),
      })),
    [staticConfigs],
  )

  const updateStaticConfig = (id: string, patch: Partial<StaticActionConfig>) => {
    const next = {
      ...staticConfigs,
      [id]: { ...(staticConfigs[id] ?? DEFAULT_ACTION_CONFIG), ...patch },
    }
    setStaticConfigs(next)
    window.desktopPet.saveStaticActionConfigs(next)
  }

  const updateAutoLaughConfig = (patch: Partial<AutoLaughConfig>) => {
    const next = { ...autoLaughConfig, ...patch }
    setAutoLaughConfig(next)
    window.desktopPet.saveAutoLaughConfig(next)
  }

  // 导入页选中的动图，拼成预览用的帧数组
  const importGifFrames = useMemo(
    () => (importGif ? framesWithDelays(importGif.frames, importGif.delays) : null),
    [importGif],
  )

  // 换了动图就重置进度条和选中区间
  useEffect(() => {
    if (!currentGifFrames) {
      setScrubFrame(0)
      setSelStart(0)
      setSelEnd(0)
      return
    }

    setScrubFrame(0)
    setSelStart(0)
    setSelEnd(currentGifFrames.length - 1)
  }, [currentGifFrames])

  const handleChoose = async () => {
    setBusy(true)
    try {
      const image = await window.desktopPet.chooseImage()
      if (image) {
        setPicked(image)
        setPetName(image.name)
        setImportGif(null)
        setCutoutMsg(null)

        if (isGifDataUrl(image.dataUrl)) {
          void decodeGifFrames(image.dataUrl)
            .then(setImportGif)
            .catch((err) => {
              const message = err instanceof Error ? err.message : String(err)
              window.desktopPet.logError(`[动图解帧] ${message}`)
              window.alert(`动图解析失败：${message}`)
            })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const handleApply = () => {
    if (!picked) {
      return
    }

    window.desktopPet.applyImage({ dataUrl: picked.dataUrl, name: petName.trim() || picked.name })
    setPicked(null)
    setImportGif(null)
    refreshLibrary()
  }

  const handleApplyGif = async () => {
    if (!picked || !importGif || applying) {
      return
    }

    setApplying(true)
    try {
      const cropped = await cropGifFrames(importGif.frames)

      window.desktopPet.applyGif({
        name: petName.trim() || picked.name,
        frames: cropped.frames,
        delays: importGif.delays,
        width: cropped.width,
        height: cropped.height,
        alphaDataUrl: cropped.alphaDataUrl,
      })
      setPicked(null)
      setImportGif(null)
      refreshLibrary()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.desktopPet.logError(`[导入动图] ${message}`)
      window.alert(`动图导入失败：${message}`)
    } finally {
      setApplying(false)
    }
  }

  const handleCutoutGif = async () => {
    if (!picked || !importGif || cutting || applying) {
      return
    }

    setCutting(true)
    setCutoutMsg('正在逐帧抠背景…')

    try {
      // 先缩小每帧再抠，CPU 跑 onnx 会快很多；桌宠目标只有 ~150px，320 足够清晰
      const downscaled: string[] = []
      for (const frame of importGif.frames) {
        downscaled.push(await downscaleDataUrl(frame, 320))
      }

      const cutout = await cutoutFrames(downscaled, (done, total) => {
        setCutoutMsg(`抠图中：${done}/${total} 帧`)
      })

      const cropped = await cropGifFrames(cutout)

      window.desktopPet.applyGif({
        name: petName.trim() || picked.name,
        frames: cropped.frames,
        delays: importGif.delays,
        width: cropped.width,
        height: cropped.height,
        alphaDataUrl: cropped.alphaDataUrl,
      })
      setPicked(null)
      setImportGif(null)
      refreshLibrary()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.desktopPet.logError(`[动图抠图] ${message}`)
      window.alert(`动图抠图失败：${message}`)
    } finally {
      setCutting(false)
      setCutoutMsg(null)
    }
  }

  const handleCutout = async () => {
    if (!picked || cutting) {
      return
    }

    setCutting(true)
    setCutoutMsg('正在准备抠图…')

    try {
      const cutoutUrl = await cutoutImage(picked.dataUrl, (key, current, total) => {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0
        setCutoutMsg(`正在下载 ${key}… ${percent}%`)
      })

      window.desktopPet.applyImage({ dataUrl: cutoutUrl, name: petName.trim() || picked.name })
      setPicked(null)
      refreshLibrary()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.desktopPet.logError(`[导入抠图] ${message}`)
      window.alert(`抠图失败：${message}`)
    } finally {
      setCutting(false)
      setCutoutMsg(null)
    }
  }

  const handleSelect = (id: string | null) => {
    window.desktopPet.selectImage(id)
    refreshLibrary()
  }

  const handleDelete = (id: string) => {
    window.desktopPet.deleteImage(id)
    refreshLibrary()
  }

  const handleStartRename = (id: string, name: string) => {
    setRenamingId(id)
    setRenameValue(name)
  }

  const handleCommitRename = (id: string) => {
    if (renamingId !== id) {
      return
    }
    const name = renameValue.trim()
    if (name) {
      window.desktopPet.renameImage(id, name)
      refreshLibrary()
    }
    setRenamingId(null)
  }

  const saveActions = (next: PetActionDef[]) => {
    setActions(next)

    if (library.currentId) {
      window.desktopPet.updateGifActions({ id: library.currentId, actions: next })
    }
  }

  const handleAddAction = () => {
    const name = actionName.trim()

    if (!name) {
      return
    }

    saveActions([
      ...actions,
      {
        id: generateActionId(),
        name,
        startFrame: Math.min(selStart, selEnd),
        endFrame: Math.max(selStart, selEnd),
        loop: actionLoop,
        soundDataUrl: pendingSound?.dataUrl,
      },
    ])
    setActionName('')
    setPendingSound(null)
  }

  const handleDeleteAction = (id: string) => {
    saveActions(actions.filter((a) => a.id !== id))
  }

  const handleChooseAudio = async () => {
    const audio = await window.desktopPet.chooseAudio()
    if (audio) {
      setPendingSound(audio)
    }
  }

  const handleApplyVideo = async () => {
    if (!picked || applying) {
      return
    }

    setApplying(true)
    try {
      const { width, height } = await videoSize(picked.dataUrl)

      window.desktopPet.applyVideo({ name: petName.trim() || picked.name, dataUrl: picked.dataUrl, width, height })
      setPicked(null)
      refreshLibrary()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.desktopPet.logError(`[导入视频] ${message}`)
      window.alert(`视频导入失败：${message}`)
    } finally {
      setApplying(false)
    }
  }

  const handleUseBuiltinSound = async () => {
    try {
      const dataUrl = await fetchAsDataUrl(laughSound)
      setPendingSound({ dataUrl, name: '奶龙大笑（内置）' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.desktopPet.logError(`[内置音效] ${message}`)
      window.alert(`内置音效加载失败：${message}`)
    }
  }

  const handleRemoveSound = (id: string) => {
    saveActions(actions.map((a) => (a.id === id ? { ...a, soundDataUrl: undefined } : a)))
  }

  const handleChooseVideoAction = async () => {
    const video = await window.desktopPet.chooseVideo()
    if (video) {
      setPickedVideoAction(video)
      setVideoActionName(video.name)
    }
  }

  const refreshVideoActions = () => {
    if (currentPet === null) {
      void window.desktopPet.getDefaultVideoActions().then(setDefaultVideoActions)
    } else {
      void window.desktopPet.getCurrentPet().then(setCurrentPet)
    }
  }

  const handleAddVideoAction = () => {
    const name = videoActionName.trim()
    if (!name || !pickedVideoAction) {
      return
    }

    window.desktopPet.applyVideoAction({
      id: currentPet === null ? null : currentPet.id,
      action: {
        id: generateActionId(),
        name,
        dataUrl: pickedVideoAction.dataUrl,
        loop: videoActionLoop,
      },
    })
    setPickedVideoAction(null)
    setVideoActionName('')
    refreshVideoActions()
  }

  const handleDeleteVideoAction = (id: string) => {
    window.desktopPet.updateVideoActions({
      id: currentPet === null ? null : currentPet.id,
      // 只保存「用户导入」的动作，别把内置动作也写进持久化列表（否则会重复）
      actions: currentVideoActions.filter((a) => a.id !== id && !isBuiltinVideoAction(a.id)),
    })
    refreshVideoActions()
  }

  const handleToggleVideoAction = (id: string, enabled: boolean) => {
    if (isBuiltinVideoAction(id)) {
      const next = { enabled: { ...builtinVideoActionConfig.enabled, [id]: enabled } }
      setBuiltinVideoActionConfig(next)
      window.desktopPet.saveBuiltinVideoActionConfig(next)
      return
    }

    const next = currentVideoActions
      .filter((a) => !isBuiltinVideoAction(a.id))
      .map((a) => (a.id === id ? { ...a, enabled } : a))
    window.desktopPet.updateVideoActions({ id: currentPet === null ? null : currentPet.id, actions: next })
    refreshVideoActions()
  }

  const pickedIsGif = picked ? isGifDataUrl(picked.dataUrl) : false
  const pickedIsVideo = picked ? isVideoDataUrl(picked.dataUrl) : false

  // 首页顶部「角色展示区」：展示当前桌宠（默认奶娃或已导入的桌宠），只读真实数据
  const heroName =
    currentPet === null
      ? '默认桌宠'
      : (library.images.find((i) => i.id === currentPet.id)?.name ?? '桌宠')
  const heroImage =
    currentPet === null
      ? defaultThumb
      : currentPet.kind === 'gif'
        ? (currentPet.frames[0] ?? defaultThumb)
        : currentPet.dataUrl
  const heroIsVideo = currentPet?.kind === 'video'

  return (
    <div className="home">
      <header className="home-hero">
        <div className="home-hero-pet">
          <div className="home-hero-avatar">
            {heroIsVideo ? (
              <video src={heroImage} muted autoPlay loop playsInline />
            ) : (
              <img src={heroImage} alt={heroName} />
            )}
          </div>
          <div className="home-hero-meta">
            <span className="home-hero-eyebrow">当前桌宠</span>
            <span className="home-hero-name">{heroName}</span>
            <span className="home-hero-status">{currentPet === null ? '默认奶娃' : '使用中'}</span>
          </div>
        </div>
        <div className="home-hero-actions">
          <button className="home-quick" title="隐藏桌宠" onClick={() => window.desktopPet.hide()}>
            <Icon name="eyeOff" size={16} />
            <span>隐藏</span>
          </button>
          <button className="home-quick" title="显示桌宠" onClick={() => window.desktopPet.show()}>
            <Icon name="eye" size={16} />
            <span>显示</span>
          </button>
          <button
            className="home-quick"
            title="开心地跳两下"
            onClick={() => window.desktopPet.triggerAction('happy')}
          >
            <Icon name="smile" size={16} />
            <span>开心</span>
          </button>
          <button
            className="home-quick"
            title="360° 旋转"
            onClick={() => window.desktopPet.triggerAction('spin')}
          >
            <Icon name="rotate" size={16} />
            <span>旋转</span>
          </button>
        </div>
      </header>

      <nav className="home-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`home-tab${tab === t.key ? ' home-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={17} />
            {t.label}
          </button>
        ))}
      </nav>

      <div className="home-body">
        {tab === 'import' && (
          <section className="home-panel">
            <h2>导入图片 / 动图</h2>
            <p className="home-hint">选一张图片或 GIF 动图，导入后会进入「桌宠样式」，并自动设为当前桌宠。</p>

            <button className="home-btn" onClick={handleChoose} disabled={busy}>
              {busy ? '选择中…' : '选择文件'}
            </button>

            {picked && (
              <div className="home-preview">
                {pickedIsVideo ? (
                  <video src={picked.dataUrl} controls muted loop />
                ) : pickedIsGif && importGifFrames ? (
                  <GifPlayer frames={importGifFrames} className="home-preview-img" />
                ) : (
                  <img src={picked.dataUrl} alt={picked.name} />
                )}
                <p className="home-hint">{picked.name}</p>

                <label className="home-field home-field--name">
                  桌宠名字
                  <input
                    className="home-input"
                    type="text"
                    value={petName}
                    onChange={(e) => setPetName(e.target.value)}
                    placeholder="给这只桌宠起个名字"
                  />
                </label>

                {pickedIsVideo ? (
                  <>
                    <button
                      className="home-btn home-btn--primary"
                      onClick={handleApplyVideo}
                      disabled={applying}
                    >
                      设为桌宠（视频）
                    </button>
                    <p className="home-hint">
                      视频会整段循环播放，并带着它自己的声音。MP4 没有透明通道，会以矩形显示。
                    </p>
                  </>
                ) : pickedIsGif ? (
                  <>
                    {importGif ? (
                      <>
                        <button
                          className="home-btn home-btn--primary"
                          onClick={handleCutoutGif}
                          disabled={cutting || applying}
                        >
                          {cutting ? '抠图中…' : '一键抠图并设为桌宠'}
                        </button>
                        <p className="home-hint">
                          会逐帧抠掉背景，变成透明底。帧越多越慢；第一次用还要联网下载模型（约 80MB），之后会缓存。
                        </p>

                        {cutoutMsg && <p className="home-progress">{cutoutMsg}</p>}

                        <button className="home-btn" onClick={handleApplyGif} disabled={cutting || applying}>
                          不抠图，直接导入
                        </button>
                      </>
                    ) : (
                      <p className="home-hint">正在解析动图…</p>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      className="home-btn home-btn--primary"
                      onClick={handleCutout}
                      disabled={cutting}
                    >
                      {cutting ? '抠图中…' : '一键抠图并设为桌宠'}
                    </button>
                    <p className="home-hint">
                      会把人物从背景里抠出来，变成透明底。第一次用需要联网下载模型（约 80MB），之后会缓存。
                    </p>

                    {cutoutMsg && <p className="home-progress">{cutoutMsg}</p>}

                    <button className="home-btn" onClick={handleApply} disabled={cutting}>
                      不抠图，直接导入原图
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {tab === 'action' && (
          <section className="home-panel">
            <h2>动作</h2>

            {currentPet?.kind === 'video' ? (
              <p className="home-hint">视频桌宠整段循环播放（带声音），暂不支持切动作。想切动作请导入 GIF 动图。</p>
            ) : currentGifFrames ? (
              <div className="home-gif-editor">
                <p className="home-hint">拖动进度条选帧，设好起止帧、起个名字，就能新建一个动作。</p>

                <div className="home-scrub-preview">
                  <img src={currentGifFrames[scrubFrame]?.dataUrl} alt="当前帧" />
                </div>

                <input
                  className="home-scrub"
                  type="range"
                  min={0}
                  max={currentGifFrames.length - 1}
                  value={scrubFrame}
                  onChange={(e) => setScrubFrame(Number(e.target.value))}
                />
                <p className="home-hint">
                  第 {scrubFrame} / {currentGifFrames.length - 1} 帧
                </p>

                <div className="home-action-editor-controls">
                  <button className="home-btn" onClick={() => setSelStart(scrubFrame)}>
                    设为起点（{selStart}）
                  </button>
                  <button className="home-btn" onClick={() => setSelEnd(scrubFrame)}>
                    设为终点（{selEnd}）
                  </button>
                </div>

                <div className="home-action-editor-controls">
                  <input
                    className="home-input"
                    type="text"
                    placeholder="动作名字，比如：走路"
                    value={actionName}
                    onChange={(e) => setActionName(e.target.value)}
                  />
                  <label className="home-check">
                    <input
                      type="checkbox"
                      checked={actionLoop}
                      onChange={(e) => setActionLoop(e.target.checked)}
                    />
                    循环播放
                  </label>
                  <button className="home-btn" onClick={handleUseBuiltinSound}>
                    用内置大笑音效
                  </button>
                  <button className="home-btn" onClick={handleChooseAudio}>
                    {pendingSound ? `声音：${pendingSound.name}` : '选声音'}
                  </button>
                  {pendingSound && (
                    <button className="home-btn" onClick={() => setPendingSound(null)}>
                      去掉
                    </button>
                  )}
                  <button className="home-btn home-btn--primary" onClick={handleAddAction}>
                    添加动作
                  </button>
                </div>

                {actions.length === 0 ? (
                  <p className="home-hint">还没有自定义动作，先在上面框一段帧建一个吧。</p>
                ) : (
                  <div className="home-action-list">
                    {actions.map((a) => (
                      <div key={a.id} className="home-action-item">
                        <GifPlayer
                          frames={currentGifFrames}
                          clip={{ startFrame: a.startFrame, endFrame: a.endFrame, loop: true }}
                          className="home-action-preview"
                        />
                        <div className="home-action-text">
                          <span className="home-action-label">
                            {a.name}
                            <span className="home-hint">
                              （第 {a.startFrame}–{a.endFrame} 帧{a.loop ? '，循环' : '，播一次'}）
                            </span>
                          </span>
                        </div>
                        <button
                          className="home-btn"
                          onClick={() => window.desktopPet.triggerAction(a.id)}
                        >
                          预览到桌宠
                        </button>
                        {a.soundDataUrl && (
                          <>
                            <button className="home-btn" onClick={() => playSound(a.soundDataUrl!)}>
                              试听
                            </button>
                            <button className="home-btn" onClick={() => handleRemoveSound(a.id)}>
                              删声音
                            </button>
                          </>
                        )}
                        <button className="home-btn" onClick={() => handleDeleteAction(a.id)}>
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="home-hint">点「预览」，桌面上的桌宠就会当场做这个动作。</p>

                <div className="home-action-list">
                  {BUILTIN_ACTIONS.map((a) => (
                    <div key={a.key} className="home-action-item">
                      <span className="home-action-icon">
                        <Icon name={a.icon} size={20} />
                      </span>
                      <div className="home-action-text">
                        <span className="home-action-label">{a.label}</span>
                        <span className="home-hint">{a.desc}</span>
                      </div>
                      <button className="home-btn" onClick={() => window.desktopPet.triggerAction(a.key)}>
                        预览
                      </button>
                    </div>
                  ))}
                </div>

                <h3 className="home-subtitle">自动捧腹大笑</h3>
                <p className="home-hint">
                  每完成 N 次动作，自动播一次捧腹大笑。默认奶娃是内置大笑视频；导入的桌宠用各自的「捧腹大笑」动作，没有就弹肚子。
                </p>
                <div className="home-action-editor-controls">
                  <label className="home-check">
                    <input
                      type="checkbox"
                      checked={autoLaughConfig.enabled}
                      onChange={(e) => updateAutoLaughConfig({ enabled: e.target.checked })}
                    />
                    启用
                  </label>
                  <span className="home-hint">每</span>
                  <input
                    className="home-input home-input--num"
                    type="number"
                    min={1}
                    value={autoLaughConfig.everyNActions}
                    onChange={(e) => {
                      const n = Math.max(1, Math.round(Number(e.target.value) || 1))
                      updateAutoLaughConfig({ everyNActions: n })
                    }}
                  />
                  <span className="home-hint">次动作</span>
                </div>

                {currentPet === null && (
                  <>
                    <h3 className="home-subtitle">静态姿势动作（默认奶蛙专属）</h3>
                    <p className="home-hint">
                      每个姿势是一张独立静态图。可自由「装备 / 卸载」，并为每个动作单独设置触发方式、展示时长、播放速度和冷却；改动即时生效并自动保存。
                    </p>
                    <div className="home-action-list home-pose-list">
                      {staticActions.map((a) => (
                        <div key={a.id} className="home-action-item home-pose-item">
                          <img src={a.imageUrl} alt={a.label} className="home-action-preview" />
                          <div className="home-action-text">
                            <span className="home-action-label">{a.label}</span>
                            <label className="home-check">
                              <input
                                type="checkbox"
                                checked={a.equipped}
                                onChange={(e) => updateStaticConfig(a.id, { equipped: e.target.checked })}
                              />
                              装备
                            </label>
                          </div>
                          <div className="home-pose-config">
                            <label className="home-field">
                              触发
                              <select
                                className="home-input"
                                value={a.trigger}
                                onChange={(e) =>
                                  updateStaticConfig(a.id, {
                                    trigger: e.target.value as StaticActionTrigger,
                                  })
                                }
                              >
                                {STATIC_TRIGGER_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="home-field">
                              时长(ms)
                              <input
                                className="home-input home-input--num"
                                type="number"
                                min={0}
                                value={a.durationMs}
                                onChange={(e) =>
                                  updateStaticConfig(a.id, { durationMs: Number(e.target.value) })
                                }
                              />
                            </label>
                            <label className="home-field">
                              速度
                              <input
                                className="home-input home-input--num"
                                type="number"
                                min={0.1}
                                step={0.1}
                                value={a.speed}
                                onChange={(e) => updateStaticConfig(a.id, { speed: Number(e.target.value) })}
                              />
                            </label>
                            <label className="home-field">
                              冷却(ms)
                              <input
                                className="home-input home-input--num"
                                type="number"
                                min={0}
                                value={a.cooldownMs}
                                onChange={(e) =>
                                  updateStaticConfig(a.id, { cooldownMs: Number(e.target.value) })
                                }
                              />
                            </label>
                          </div>
                          <button
                            className="home-btn"
                            onClick={() => window.desktopPet.triggerAction(a.id)}
                          >
                            预览到桌宠
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <h3 className="home-subtitle">动作视频（触发才播）</h3>
                <p className="home-hint">
                  选一段短视频当一个动作，触发时桌宠播这段视频、播完回待机。勾选「应用」的动作才会在点桌宠 / 自动大笑时被用到（可勾多个）；未勾选的只在手动「预览」时播。默认奶娃自带「捧腹大笑」（点桌宠就播，无需导入）。
                </p>

                <div className="home-action-editor-controls">
                  <button className="home-btn" onClick={handleChooseVideoAction}>
                    {pickedVideoAction ? `视频：${pickedVideoAction.name}` : '选动作视频'}
                  </button>
                  <input
                    className="home-input"
                    type="text"
                    placeholder="动作名字，比如：捧腹大笑"
                    value={videoActionName}
                    onChange={(e) => setVideoActionName(e.target.value)}
                  />
                  <label className="home-check">
                    <input
                      type="checkbox"
                      checked={videoActionLoop}
                      onChange={(e) => setVideoActionLoop(e.target.checked)}
                    />
                    循环播放
                  </label>
                  <button
                    className="home-btn home-btn--primary"
                    onClick={handleAddVideoAction}
                    disabled={!pickedVideoAction}
                  >
                    添加动作
                  </button>
                </div>

                {currentVideoActions.length === 0 ? (
                  <p className="home-hint">还没有动作视频，先选一个视频建个动作吧。</p>
                ) : (
                  <div className="home-action-list">
                    {currentVideoActions.map((a) => (
                      <div key={a.id} className="home-action-item">
                        <video src={a.dataUrl} muted preload="metadata" className="home-action-preview" />
                        <div className="home-action-text">
                          <span className="home-action-label">
                            {a.name}
                            {isBuiltinVideoAction(a.id) && <span className="home-badge">内置</span>}
                            <span className="home-hint">（{a.loop ? '循环' : '播一次'}）</span>
                          </span>
                          <label className="home-check">
                            <input
                              type="checkbox"
                              checked={a.enabled !== false}
                              onChange={(e) => handleToggleVideoAction(a.id, e.target.checked)}
                            />
                            应用
                          </label>
                        </div>
                        <button
                          className="home-btn"
                          onClick={() => window.desktopPet.triggerAction(a.id)}
                        >
                          预览到桌宠
                        </button>
                        {!isBuiltinVideoAction(a.id) && (
                          <button className="home-btn" onClick={() => handleDeleteVideoAction(a.id)}>
                            删除
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {tab === 'style' && (
          <section className="home-panel">
            <h2>桌宠样式</h2>
            <p className="home-hint">管理你导入过的图片和动图，点一张就能让它变成当前桌宠。</p>

            {library.images.length === 0 ? (
              <p className="home-hint">还没有导入内容，去「导入」页加一张吧。</p>
            ) : (
              <div className="home-grid">
                <div
                  className={`home-card${library.currentId === null ? ' home-card--current' : ''}`}
                  onClick={() => handleSelect(null)}
                  role="button"
                >
                  <img src={defaultThumb} alt="默认桌宠" />
                  <span className="home-card-name">默认桌宠</span>
                  {library.currentId === null && <span className="home-card-badge">使用中</span>}
                </div>

                {library.images.map((img) => (
                  <div
                    key={img.id}
                    className={`home-card${library.currentId === img.id ? ' home-card--current' : ''}`}
                    onClick={() => handleSelect(img.id)}
                    role="button"
                  >
                    {img.kind === 'video' ? (
                      <video src={img.dataUrl} muted preload="metadata" />
                    ) : (
                      <img src={img.kind === 'gif' ? (img.frames[0] ?? defaultThumb) : img.dataUrl} alt={img.name} />
                    )}
                    {renamingId === img.id ? (
                      <input
                        className="home-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCommitRename(img.id)
                          } else if (e.key === 'Escape') {
                            setRenamingId(null)
                          }
                        }}
                        onBlur={() => handleCommitRename(img.id)}
                        autoFocus
                      />
                    ) : (
                      <span className="home-card-name">{img.name}</span>
                    )}
                    {img.kind === 'gif' && <span className="home-card-badge">动图</span>}
                    {img.kind === 'video' && <span className="home-card-badge">视频</span>}
                    {library.currentId === img.id && <span className="home-card-badge">使用中</span>}
                    <button
                      className="home-card-rename"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStartRename(img.id, img.name)
                      }}
                    >
                      重命名
                    </button>
                    <button
                      className="home-card-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(img.id)
                      }}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default HomeApp
