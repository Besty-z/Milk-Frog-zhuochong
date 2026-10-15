import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { BellyJelly, DEFAULT_CONFIG, drawBellyJelly, type BellyJellyConfig } from './BellyJelly'

// BellyJellyPet：静态桌宠的「果冻肚」渲染层。
// 用 <canvas> 替代原来的 <img>：每帧按弹簧位移把肚子区域做局部上下形变，其余区域不动。
// 通过 ref 暴露 poke / applyDragVelocity / endDrag 给 App 调用（点击、拖动、松手）。

export interface BellyJellyHandle {
  poke: () => void
  applyDragVelocity: (vyPixelsPerSecond: number) => void
  endDrag: () => void
}

interface BellyJellyPetProps {
  imageUrl: string
  config?: Partial<BellyJellyConfig>
}

export const BellyJellyPet = forwardRef<BellyJellyHandle, BellyJellyPetProps>(
  function BellyJellyPet({ imageUrl, config }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)
    const jellyRef = useRef<BellyJelly | null>(null)
    const configRef = useRef<BellyJellyConfig>({ ...DEFAULT_CONFIG, ...config })

    useImperativeHandle(
      ref,
      () => ({
        poke: () => jellyRef.current?.poke(),
        applyDragVelocity: (vyPxPerSec) => {
          const canvas = canvasRef.current
          if (!canvas || canvas.clientHeight <= 0) {
            return
          }
          // 屏幕像素/秒 → 图片高度比例/秒
          jellyRef.current?.applyDragVelocity(vyPxPerSec / canvas.clientHeight)
        },
        endDrag: () => jellyRef.current?.endDrag(),
      }),
      [],
    )

    // 加载图片（切图 / 换图时重新加载）
    useEffect(() => {
      let cancelled = false
      const img = new Image()
      img.onload = () => {
        if (cancelled) {
          return
        }
        imageRef.current = img
      }
      img.src = imageUrl
      return () => {
        cancelled = true
      }
    }, [imageUrl])

    // 渲染循环：每帧推进弹簧 + 重画。画布很小，逐行重画的开销可忽略。
    useEffect(() => {
      jellyRef.current = new BellyJelly(configRef.current)
      let raf = 0
      let last = performance.now()

      const tick = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.05)
        last = now

        const canvas = canvasRef.current
        const img = imageRef.current
        const jelly = jellyRef.current

        if (canvas && img && jelly) {
          const dpr = window.devicePixelRatio || 1
          const w = canvas.clientWidth
          const h = canvas.clientHeight

          if (w > 0 && h > 0) {
            const bw = Math.round(w * dpr)
            const bh = Math.round(h * dpr)
            if (canvas.width !== bw || canvas.height !== bh) {
              canvas.width = bw
              canvas.height = bh
            }

            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
              const offset = jelly.update(dt)
              drawBellyJelly(ctx, img, w, h, offset, configRef.current.region)
            }
          }
        }

        raf = requestAnimationFrame(tick)
      }

      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }, [])

    return <canvas ref={canvasRef} className="pet-canvas" />
  },
)
