import { useEffect, useMemo, useRef, useState } from 'react'
import { displaySizeFor, getDefaultPetImage, loadPetSprite } from './modules/AssetManager'
import { cutoutImage } from './modules/BackgroundRemoval'
import { dataUrlToCanvas, framesWithDelays } from './modules/GifDecoder'
import { GifPlayer, type GifClip } from './modules/GifPlayer'
import { TransparentVideo } from './modules/TransparentVideo'
import { usePetAction } from './modules/ActionModule'
import { usePetInteraction } from './modules/PetInteraction'
import { PetRenderer } from './modules/PetRenderer'

// App 只负责「组装」：把素材、动作、交互、渲染这几个模块接起来。
// 现在支持两种桌宠：静态图（沿用抠图/包围盒）和动图（解帧后播放）。

function App() {
  const stageRef = useRef<HTMLElement>(null)
  const alphaCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const soundRef = useRef<HTMLAudioElement | null>(null)
  // 待机时的窗口尺寸（静态/动图/整段视频各效果里记录），动作视频播完恢复用
  const idleSizeRef = useRef<{ width: number; height: number } | null>(null)

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

  const { action, play, stop } = usePetAction()

  // 点击桌宠 → 捧腹大笑：播当前桌宠（或默认奶娃）的「捧腹大笑」视频动作（视频自带声音）
  const triggerLaugh = () => {
    const videoActions = currentPet ? (currentPet.videoActions ?? []) : defaultVideoActions
    const laughAction = videoActions.find((a) => a.name.includes('捧腹大笑')) ?? videoActions[0]

    if (laughAction) {
      setVideoClip({ dataUrl: laughAction.dataUrl, loop: false })
    } else {
      play('happy')
    }
  }

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

  // 首页「动作」页触发某个动作，这里转发：动作视频片段 → 动图切帧区间 → 静态图 CSS 动画
  useEffect(() => {
    return window.desktopPet.onTriggerAction((actionId) => {
      // 1) 动作视频片段：在当前桌宠（或默认奶娃）自己的动作列表里按 id 找
      const videoActions = currentPet ? (currentPet.videoActions ?? []) : defaultVideoActions
      const clipDef = videoActions.find((a) => a.id === actionId)

      if (clipDef) {
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

      // 4) 静态图：CSS 动作
      if (actionId === 'happy') {
        play('happy')
      } else if (actionId === 'idle') {
        stop()
      }
    })
  }, [play, stop, currentPet, defaultVideoActions])

  // 静态图：算人物包围盒 → 裁图 → 收紧窗口尺寸 → 重建 alpha 图（点击穿透判定用）
  useEffect(() => {
    if (currentPet?.kind === 'gif' || currentPet?.kind === 'video') {
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
  }, [imageUrl, currentPet?.kind])

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
      onTap: () => triggerLaugh(),
      onDragStart: (screenX, screenY) => {
        play('drag')
        window.desktopPet.dragStart(screenX, screenY)
      },
      onDragMove: (screenX, screenY) => window.desktopPet.dragMove(screenX, screenY),
      onDragEnd: () => {
        stop()
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
      return <PetRenderer imageUrl={spriteUrl ?? imageUrl} action={action} />
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
      {renderBody()}
    </main>
  )
}

export default App
