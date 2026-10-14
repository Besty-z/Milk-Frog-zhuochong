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
import laughSound from './assets/laugh.mp3'
import './home.css'

// HomeApp：桌宠「首页」。三个标签页：导入 / 动作 / 桌宠样式。
// 「动作」页：当前是动图时，提供帧进度条 + 动作编辑器，每个动作还能在主页里直接看预览。

type Tab = 'import' | 'action' | 'style'

const TABS: { key: Tab; label: string }[] = [
  { key: 'import', label: '导入' },
  { key: 'action', label: '动作' },
  { key: 'style', label: '桌宠样式' },
]

const BUILTIN_ACTIONS: { key: string; label: string; desc: string }[] = [
  { key: 'idle', label: '待机', desc: '停止当前动作，回到待机状态' },
  { key: 'happy', label: '开心', desc: '开心地跳两下' },
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
  const [busy, setBusy] = useState(false)
  const [cutting, setCutting] = useState(false)
  const [cutoutMsg, setCutoutMsg] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  // 动作编辑器里「待添加」的声音（选好后跟着下一个动作一起存）
  const [pendingSound, setPendingSound] = useState<{ dataUrl: string; name: string } | null>(null)
  const [library, setLibrary] = useState<PetLibrary>({ images: [], currentId: null })
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

  // 当前桌宠的动作视频列表：默认奶娃用 defaultVideoActions，导入的桌宠用条目里的 videoActions
  const currentVideoActions = currentPet ? (currentPet.videoActions ?? []) : defaultVideoActions

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

    window.desktopPet.applyImage(picked)
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
        name: picked.name,
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
        name: picked.name,
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

      window.desktopPet.applyImage({ dataUrl: cutoutUrl, name: picked.name })
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

      window.desktopPet.applyVideo({ name: picked.name, dataUrl: picked.dataUrl, width, height })
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
      actions: currentVideoActions.filter((a) => a.id !== id),
    })
    refreshVideoActions()
  }

  const pickedIsGif = picked ? isGifDataUrl(picked.dataUrl) : false
  const pickedIsVideo = picked ? isVideoDataUrl(picked.dataUrl) : false

  return (
    <div className="home">
      <nav className="home-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`home-tab${tab === t.key ? ' home-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
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

                <h3 className="home-subtitle">动作视频（触发才播）</h3>
                <p className="home-hint">
                  选一段短视频当一个动作，触发时桌宠播这段视频、播完回待机。动作按桌宠各自存：捧腹大笑这类是当前桌宠专属，换别的桌宠要用它自己的视频。
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
                            <span className="home-hint">（{a.loop ? '循环' : '播一次'}）</span>
                          </span>
                        </div>
                        <button
                          className="home-btn"
                          onClick={() => window.desktopPet.triggerAction(a.id)}
                        >
                          预览到桌宠
                        </button>
                        <button className="home-btn" onClick={() => handleDeleteVideoAction(a.id)}>
                          删除
                        </button>
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
                    <span className="home-card-name">{img.name}</span>
                    {img.kind === 'gif' && <span className="home-card-badge">动图</span>}
                    {img.kind === 'video' && <span className="home-card-badge">视频</span>}
                    {library.currentId === img.id && <span className="home-card-badge">使用中</span>}
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
