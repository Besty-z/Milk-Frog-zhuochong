import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { displaySizeFor, getDefaultPetImage, hasTransparency, loadPetSprite } from './modules/AssetManager'
import { cutoutImage } from './modules/BackgroundRemoval'
import { dataUrlToCanvas, framesWithDelays } from './modules/GifDecoder'
import { GifPlayer, type GifClip } from './modules/GifPlayer'
import { TransparentVideo } from './modules/TransparentVideo'
import { usePetInteraction } from './modules/PetInteraction'
import { BellyJellyPet, type BellyJellyHandle } from './modules/BellyJellyPet'
import { SpinRotator, type SpinHandle } from './modules/SpinRotator'
import {
  DEFAULT_ACTION_CONFIG,
  MOTION_BASE_DURATION,
  STATIC_POSE_ACTIONS,
  type StaticAction,
} from './modules/PoseActions'
import { BUILTIN_DEFAULT_VIDEO_ACTIONS } from './modules/DefaultPetActions'

// App 只负责「组装」：把素材、动作、交互、渲染这几个模块接起来。
// 现在支持两种桌宠：静态图（沿用抠图/包围盒）和动图（解帧后播放）。

function App() {
  const stageRef = useRef<HTMLElement>(null)
  const alphaCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const soundRef = useRef<HTMLAudioElement | null>(null)
  // 待机时的窗口尺寸（静态/动图/整段视频各效果里记录），动作视频播完恢复用
  const idleSizeRef = useRef<{ width: number; height: number } | null>(null)
  // 果冻肚：静态图桌宠的肚子形变控制器 + 拖动速度跟踪
  const bellyRef = useRef<BellyJellyHandle | null>(null)
  const lastDragRef = useRef<{ y: number; t: number } | null>(null)
  // 360° 旋转：独立动作，用 SpinRotator 包裹渲染层
  const spinRef = useRef<SpinHandle | null>(null)
  // 静态姿势动作（默认奶娃专属）：正在展示的姿势 + 它抠图后的显示图
  const [pose, setPose] = useState<StaticAction | null>(null)
  const [poseSpriteUrl, setPoseSpriteUrl] = useState<string | null>(null)
  const poseTimerRef = useRef(0)
  // 静态动作配置：从 main 进程读，变更时跟随（装备/触发方式/时长/速度/冷却）
  const [staticConfigs, setStaticConfigs] = useState<Record<string, StaticActionConfig>>({})
  // 自动捧腹大笑规则：每完成 N 次动作自动播一次（配置从 main 读，变更时跟随）
  const [autoLaughConfig, setAutoLaughConfig] = useState<AutoLaughConfig>({ enabled: true, everyNActions: 3 })
  // 已完成的「动作」计数：每触发一次动作 +1，用来判定是否到自动大笑的阈值
  const [actionTick, setActionTick] = useState(0)
  // 内置动作视频（捧腹大笑）的「应用」开关：按 id 存，缺省 = 启用
  const [builtinVideoActionConfig, setBuiltinVideoActionConfig] = useState<BuiltinVideoActionConfig>({
    enabled: {},
  })

  // 默认图（自带的那张）：优先用「抠图缓存」，没有就先显示原图、后台抠好再换上
  const [defaultImage, setDefaultImage] = useState<string>(getDefaultPetImage)
  // 用户导入的当前桌宠（null 表示用默认图）
  const [currentPet, setCurrentPet] = useState<PetDescriptor | null>(null)

  // 静态图：裁到人物包围盒后的图
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null)
  // 当前播放的片段（clip 为空 = 整段循环 = 待机）
  const [clip, setClip] = useState<GifClip | null>(null)
  // 当前播放的动作视频片段（为空 = 没在播动作视频）
  const [videoClip, setVideoClip] = useState<{ dataUrl: string; loop: boolean } | null>(null)
  // 默认奶娃自己的动作视频列表（导入桌宠的动作从 currentPet.videoActions 读）
  const [defaultVideoActions, setDefaultVideoActions] = useState<VideoActionDef[]>([])
  // 默认奶娃的有效动作视频 = 自带「捧腹大笑」+ 用户自己导入的默认动作
  // 内置动作的「应用」开关从 builtinVideoActionConfig 读（缺省启用）。
  const effectiveDefaultVideoActions = useMemo(
    () => [
      ...BUILTIN_DEFAULT_VIDEO_ACTIONS.map((a) => ({
        ...a,
        enabled: builtinVideoActionConfig.enabled[a.id] ?? true,
      })),
      ...defaultVideoActions,
    ],
    [defaultVideoActions, builtinVideoActionConfig],
  )

  // 真正播「捧腹大笑」：当前桌宠（或默认奶娃）的动作里找大笑视频，没有就退回果冻肚弹一下
  const playLaugh = useCallback(() => {
    const all = currentPet ? (currentPet.videoActions ?? []) : effectiveDefaultVideoActions
    // 只播「已应用/启用」的动作；没有启用的就退回果冻肚弹一下
    const videoActions = all.filter((a) => a.enabled !== false)
    const laughAction = videoActions.find((a) => a.name.includes('捧腹大笑')) ?? videoActions[0]

    if (laughAction) {
      setVideoClip({ dataUrl: laughAction.dataUrl, loop: false })
    } else {
      bellyRef.current?.poke()
    }
  }, [currentPet, effectiveDefaultVideoActions])

  // 点击桌宠 → 捧腹大笑：先记一次「动作」，再播大笑（视频自带声音）
  const triggerLaugh = () => {
    setActionTick((t) => t + 1)
    playLaugh()
  }

  // 静态动作：把「基础信息 + 用户配置」合成完整动作；每触发一次都是新对象，
  // 好让姿势 effect 重新跑、重新计时（也顺便重置自动回待机的倒计时）。
  const staticActions = useMemo<StaticAction[]>(
    () =>
      STATIC_POSE_ACTIONS.map((base) => ({
        ...base,
        ...DEFAULT_ACTION_CONFIG,
        ...(staticConfigs[base.id] ?? {}),
      })),
    [staticConfigs],
  )

  // 冷却：记录每个动作上次触发的时间
  const lastFiredRef = useRef<Record<string, number>>({})

  const fireStaticAction = useCallback((action: StaticAction, ignoreCooldown = false) => {
    if (!ignoreCooldown) {
      const last = lastFiredRef.current[action.id] ?? 0
      const now = performance.now()
      if (action.cooldownMs > 0 && now - last < action.cooldownMs) {
        return
      }
      lastFiredRef.current[action.id] = now
    }
    setPose({ ...action })
    setActionTick((t) => t + 1)
  }, [])

  // 按「触发条件」找第一个已装备的动作来触发；返回是否命中。
  // 静态姿势动作是默认奶娃专属，导入的桌宠不响应（点击等仍走原有逻辑）。
  const fireTriggered = useCallback(
    (trigger: StaticActionTrigger) => {
      if (currentPet !== null) {
        return false
      }
      const action = staticActions.find((a) => a.equipped && a.trigger === trigger)
      if (!action) {
        return false
      }
      fireStaticAction(action)
      return true
    },
    [currentPet, staticActions, fireStaticAction],
  )

  const isGif = currentPet?.kind === 'gif'
  const isVideo = currentPet?.kind === 'video'
  const videoUrl = currentPet?.kind === 'video' ? currentPet.dataUrl : null
  const staticImageUrl = currentPet?.kind === 'image' ? currentPet.dataUrl : null
  const imageUrl = staticImageUrl ?? defaultImage

  // 启动时：读默认图的抠图缓存；没有就后台抠一次，成功后缓存 + 换用透明版
  useEffect(() => {
    let cancelled = false

    void window.desktopPet.getDefaultCutout().then((cached) => {
      if (cancelled) {
        return
      }

      if (cached) {
        setDefaultImage(cached)
        return
      }

      void cutoutImage(getDefaultPetImage(), (key, current, total) => {
        console.log(`[默认桌宠] 下载 ${key}：${current}/${total}`)
      })
        .then((dataUrl) => {
          if (cancelled) {
            return
          }

          console.log('[默认桌宠] 抠图成功，已缓存')
          window.desktopPet.saveDefaultCutout(dataUrl)
          setDefaultImage(dataUrl)
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          console.error('[默认桌宠] 抠图失败：', err)
          window.desktopPet.logError(`[默认桌宠抠图] ${message}`)
          window.alert(`默认桌宠抠图失败：\n${message}`)
        })
    })

    return () => {
      cancelled = true
    }
  }, [])

  // 启动时问主进程：有没有已导入的桌宠，有就换上
  useEffect(() => {
    void window.desktopPet.getCurrentPet().then((pet) => {
      setCurrentPet(pet)
    })
  }, [])

  // 主进程通知「换图」时，跟随更新（null 表示恢复默认图）
  useEffect(() => {
    return window.desktopPet.onPetChanged((pet) => {
      setCurrentPet(pet)
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

  // 首页「动作」页触发某个动作，这里转发：动作视频片段 → 动图切帧区间 → 静态图 CSS 动画
  useEffect(() => {
    return window.desktopPet.onTriggerAction((actionId) => {
      // 0) 360° 旋转：独立动作，直接开转，不和其他动作联动
      if (actionId === 'spin') {
        setActionTick((t) => t + 1)
        spinRef.current?.start()
        return
      }

      // 0.5) 静态姿势动作：默认奶娃专属，手动/预览触发（忽略冷却），切姿势图 + 位移动画
      const poseAction = staticActions.find((a) => a.id === actionId)
      if (poseAction && currentPet === null) {
        fireStaticAction(poseAction, true)
        return
      }

      // 其它动作（视频 / 动图 / 开心 / 待机）都先把正在展示的姿势清掉，回到待机图
      setPose(null)

      // 1) 动作视频片段：在当前桌宠（或默认奶娃）自己的动作列表里按 id 找
      const videoActions = currentPet ? (currentPet.videoActions ?? []) : effectiveDefaultVideoActions
      const clipDef = videoActions.find((a) => a.id === actionId)

      if (clipDef) {
        setActionTick((t) => t + 1)
        setVideoClip({ dataUrl: clipDef.dataUrl, loop: clipDef.loop })
        return
      }

      // 不是视频动作：先清掉正在播的片段
      setVideoClip(null)

      // 2) 回到待机：清动图片段 + 停声音
      if (actionId === 'idle') {
        if (soundRef.current) {
          soundRef.current.pause()
          soundRef.current = null
        }
      }

      // 3) 动图：切帧区间
      if (currentPet?.kind === 'gif') {
        if (actionId === 'idle') {
          setClip(null)
          return
        }

        const def = currentPet.actions.find((a) => a.id === actionId)

        if (def) {
          setActionTick((t) => t + 1)
          setClip({ startFrame: def.startFrame, endFrame: def.endFrame, loop: def.loop })

          if (def.soundDataUrl) {
            if (soundRef.current) {
              soundRef.current.pause()
            }
            const audio = new Audio(def.soundDataUrl)
            soundRef.current = audio
            void audio.play().catch(() => {})
          }
        }
        return
      }

      // 4) 静态图：果冻肚弹一下
      if (actionId === 'happy') {
        setActionTick((t) => t + 1)
        bellyRef.current?.poke()
      }
    })
  }, [currentPet, effectiveDefaultVideoActions, staticActions, fireStaticAction])

  // 空闲随机：隔段时间，在没在展示姿势/视频/片段时，随机触发 trigger==='idleRandom' 的已装备动作
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (pose || videoClip || clip) {
        return
      }
      fireTriggered('idleRandom')
    }, 8000)
    return () => window.clearInterval(timer)
  }, [fireTriggered, pose, videoClip, clip])

  // 每完成 N 次动作，自动播一次捧腹大笑（配置可开关、可调 N）
  useEffect(() => {
    if (!autoLaughConfig.enabled || autoLaughConfig.everyNActions < 1) {
      return
    }
    if (actionTick === 0 || actionTick % autoLaughConfig.everyNActions !== 0) {
      return
    }
    playLaugh()
  }, [actionTick, autoLaughConfig, playLaugh])

  // 静态图：算人物包围盒 → 裁图 → 收紧窗口尺寸 → 重建 alpha 图（点击穿透判定用）
  useEffect(() => {
    if (currentPet?.kind === 'gif' || currentPet?.kind === 'video' || pose) {
      return
    }

    let cancelled = false

    setSpriteUrl(null)

    void loadPetSprite(imageUrl)
      .then((sprite) => {
        if (cancelled) {
          return
        }

        setSpriteUrl(sprite.dataUrl)
        alphaCanvasRef.current = sprite.alphaCanvas
        idleSizeRef.current = { width: sprite.width, height: sprite.height }
        window.desktopPet.setSize(sprite.width, sprite.height)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [imageUrl, currentPet?.kind, pose])

  // 静态姿势动作：先拿（或现抠）透明图，再裁到包围盒 + 收紧窗口。
  // 抠图失败（比如首次没网）退回原图，姿势照常展示、只是带背景。
  useEffect(() => {
    if (!pose) {
      setPoseSpriteUrl(null)
      return
    }

    let cancelled = false
    setPoseSpriteUrl(null)

    void (async () => {
      let cutout: string | null = await window.desktopPet.getCutout(pose.id)
      if (cancelled) {
        return
      }

      if (!cutout) {
        // 图片自带透明（比如 PNG 透明底）就直接用原图，跳过抠图
        const alreadyTransparent = await hasTransparency(pose.imageUrl)
        if (cancelled) {
          return
        }

        if (!alreadyTransparent) {
          try {
            cutout = await cutoutImage(pose.imageUrl, () => {})
            window.desktopPet.saveCutout(pose.id, cutout)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            window.desktopPet.logError(`[姿势抠图 ${pose.label}] ${message}`)
            cutout = pose.imageUrl
          }
        } else {
          cutout = pose.imageUrl
        }
      }
      if (cancelled) {
        return
      }

      const sprite = await loadPetSprite(cutout)
      if (cancelled) {
        return
      }

      setPoseSpriteUrl(sprite.dataUrl)
      alphaCanvasRef.current = sprite.alphaCanvas
      window.desktopPet.setSize(sprite.width, sprite.height)

      // 姿势图真正显示出来后，才开始计时自动回待机（首次抠图可能要几秒，不能提前算时间）
      poseTimerRef.current = window.setTimeout(() => setPose(null), pose.durationMs)
    })().catch(() => {})

    return () => {
      cancelled = true
      window.clearTimeout(poseTimerRef.current)
    }
  }, [pose])

  // 动图：导入时已经解码成帧了，这里只把它们拼成 GifPlayer 要的 {dataUrl, delay}。
  // 用 id 做依赖——动作编辑会广播新的 currentPet，但 id 不变，不能因此重建帧。
  const gifPet = currentPet?.kind === 'gif' ? currentPet : null
  const gifFrames = useMemo(
    () => (gifPet ? framesWithDelays(gifPet.frames, gifPet.delays) : null),
    [gifPet?.id],
  )

  useEffect(() => {
    if (!gifPet) {
      setClip(null)
      return
    }

    setClip(null)

    void dataUrlToCanvas(gifPet.alphaDataUrl)
      .then((alpha) => {
        alphaCanvasRef.current = alpha
      })
      .catch(() => {})

    const { width, height } = displaySizeFor(gifPet.width, gifPet.height)
    idleSizeRef.current = { width, height }
    window.desktopPet.setSize(width, height)
  }, [gifPet?.id])

  // 视频：没有透明信息，整块都算可点（不透穿）；常是横屏，按最长边 260 等比缩放窗口
  useEffect(() => {
    if (!isVideo || !currentPet || currentPet.kind !== 'video') {
      return
    }

    const alpha = document.createElement('canvas')
    alpha.width = currentPet.width
    alpha.height = currentPet.height
    const ctx = alpha.getContext('2d')
    if (ctx) {
      ctx.fillRect(0, 0, alpha.width, alpha.height)
    }
    alphaCanvasRef.current = alpha

    const scale = 260 / Math.max(currentPet.width, currentPet.height)
    idleSizeRef.current = {
      width: Math.round(currentPet.width * scale),
      height: Math.round(currentPet.height * scale),
    }
    window.desktopPet.setSize(idleSizeRef.current.width, idleSizeRef.current.height)
  }, [isVideo, currentPet])

  // 动作视频播完 / 被清掉后，把窗口恢复成待机尺寸
  useEffect(() => {
    if (videoClip) {
      return
    }
    if (idleSizeRef.current) {
      window.desktopPet.setSize(idleSizeRef.current.width, idleSizeRef.current.height)
    }
  }, [videoClip])

  const { onPointerDown, onPointerMove, onPointerUp } = usePetInteraction(
    stageRef,
    alphaCanvasRef,
    {
      onTap: () => {
        // 有装备「单击」动作就触发它；没有才退回原来的捧腹大笑/果冻肚
        if (!fireTriggered('click')) {
          triggerLaugh()
        }
      },
      onDoubleTap: () => {
        fireTriggered('double')
      },
      onDragStart: (screenX, screenY) => {
        fireTriggered('dragStart')
        lastDragRef.current = { y: screenY, t: performance.now() }
        window.desktopPet.dragStart(screenX, screenY)
      },
      onDragMove: (screenX, screenY) => {
        // 拖动时把垂直速度喂给肚子，速度越快晃得越明显
        const now = performance.now()
        const last = lastDragRef.current
        if (last) {
          const dt = (now - last.t) / 1000
          if (dt > 0) {
            bellyRef.current?.applyDragVelocity((screenY - last.y) / dt)
          }
          lastDragRef.current = { y: screenY, t: now }
        }
        window.desktopPet.dragMove(screenX, screenY)
      },
      onDragEnd: () => {
        fireTriggered('dragEnd')
        bellyRef.current?.endDrag()
        window.desktopPet.dragEnd()
      },
    },
  )

  const renderBody = () => {
    // 动作视频片段最优先：触发才播，播完（非循环）自动回待机
    // 用 TransparentVideo 把纯黑背景实时抠透明，窗口跟着视频比例缩放
    if (videoClip) {
      return (
        <TransparentVideo
          src={videoClip.dataUrl}
          loop={videoClip.loop}
          onEnded={() => setVideoClip(null)}
          onSizeChange={(width, height) => window.desktopPet.setSize(width, height)}
        />
      )
    }

    if (isVideo && videoUrl) {
      return <video className="pet-photo" src={videoUrl} autoPlay loop playsInline />
    }

    if (isGif && gifFrames) {
      return (
        <GifPlayer
          frames={gifFrames}
          clip={clip}
          className="pet-photo"
          onClipEnd={() => setClip(null)}
        />
      )
    }

    if (!isGif) {
      const displayUrl = poseSpriteUrl ?? spriteUrl ?? imageUrl
      return (
        <div
          key={pose?.id ?? 'idle'}
          className={`pose-motion${pose ? ` pose-motion--${pose.motion}` : ''}`}
          style={
            pose
              ? { animationDuration: `${MOTION_BASE_DURATION[pose.motion] / pose.speed}ms` }
              : undefined
          }
        >
          <BellyJellyPet ref={bellyRef} imageUrl={displayUrl} />
        </div>
      )
    }

    // 动图还没准备好：先不渲染任何东西（保持透明窗口）
    return null
  }

  return (
    <main
      className="pet-stage"
      ref={stageRef}
      aria-label="桌宠"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <SpinRotator ref={spinRef}>{renderBody()}</SpinRotator>
    </main>
  )
}

export default App
