import { useEffect, useRef, useState } from 'react'
import type { GifFrame } from './GifDecoder'

// GifPlayer：按帧 delay 播放一段帧区间。桌宠窗口和首页预览共用。
// clip 为空时播放「整段循环」（= 待机）；clip.loop=false 时播完一次就停，
// 并通过 onClipEnd 通知上层（比如回到待机）。

export interface GifClip {
  startFrame: number
  endFrame: number // 含
  loop: boolean
}

interface GifPlayerProps {
  frames: GifFrame[]
  clip?: GifClip | null
  playing?: boolean
  className?: string
  onClipEnd?: () => void
}

export function GifPlayer({ frames, clip, playing = true, className, onClipEnd }: GifPlayerProps) {
  const start = clip?.startFrame ?? 0
  const end = clip ? Math.min(clip.endFrame, frames.length - 1) : frames.length - 1
  const loop = clip?.loop ?? true

  const [frameIndex, setFrameIndex] = useState(start)
  const frameIndexRef = useRef(start)
  const timeoutRef = useRef<number | null>(null)
  const onClipEndRef = useRef(onClipEnd)

  useEffect(() => {
    onClipEndRef.current = onClipEnd
  }, [onClipEnd])

  // 切动作 / 换图时，从新片段的第一帧开始
  useEffect(() => {
    frameIndexRef.current = start
    setFrameIndex(start)
  }, [start, end, loop, frames])

  // 推进帧：每帧按自己的 delay 停留，到结尾按 loop 决定循环还是停
  useEffect(() => {
    if (!playing || frames.length === 0) {
      return
    }

    let disposed = false

    const step = () => {
      const delay = frames[frameIndexRef.current]?.delay ?? 100

      timeoutRef.current = window.setTimeout(() => {
        if (disposed) {
          return
        }

        const next = frameIndexRef.current + 1

        if (next > end) {
          if (loop) {
            frameIndexRef.current = start
            setFrameIndex(start)
            return
          }

          // 不循环：停在最后一帧，并告诉上层播完了
          onClipEndRef.current?.()
          return
        }

        frameIndexRef.current = next
        setFrameIndex(next)
      }, delay)
    }

    step()

    return () => {
      disposed = true

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [playing, frames, start, end, loop, frameIndex])

  return (
    <img
      className={className}
      src={frames[frameIndex]?.dataUrl}
      alt="桌宠动图"
      draggable={false}
    />
  )
}
