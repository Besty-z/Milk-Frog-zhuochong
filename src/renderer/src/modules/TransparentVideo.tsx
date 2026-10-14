import { useEffect, useRef } from 'react'

// TransparentVideo：播放动作视频时，把背景实时抠成透明。
// 视频结构：上下两条黑边 + 中间白底 + 角色（奶蛙：金色身体 + 白肚皮）。
// 黑边按亮度抠；白底按「离白近 且 低饱和」从边框泛洪抠，边界给软透明度让白毛边渐隐。
// 角色身上的白肚皮/深色描边因为被金色身体包围、不连边框，不会被误抠。

// 目标显示尺寸：最长边压到这么大（像素），等比缩放，保证桌宠大小适中
const TARGET_LONGEST = 260
// 近黑阈值：亮度 <= 这个值算「黑边」。黑边有压缩噪点，阈值放高一点一并吃掉。
const DARK_LUM = 55
// 白底不能用单一亮度阈值——奶蛙自己的浅金色高光（亮度 210+）会和白底混。
// 改用「离白距离 + 饱和度」双条件：白底/白毛边是低饱和的近中性色，奶蛙金色高饱和(R 远大于 B)。
// 离白距离：0=纯白，越大离白越远；饱和度 = max(r,g,b)-min(r,g,b)
const WD_CORE = 30 // 离白 < 这个 且 饱和 < SAT_CORE = 核心白底（确定抠掉）
const WD_MAX = 95 // 离白 >= 这个 或 饱和 >= SAT_MAX = 绝不是白底（角色）
const SAT_CORE = 25
const SAT_MAX = 70
// 核心白底对应的「白度分数」上界（软边从这开始往不透明渐变）
const CORE_SCORE = Math.max(WD_CORE / WD_MAX, SAT_CORE / SAT_MAX)

interface TransparentVideoProps {
  src: string
  loop?: boolean
  onEnded?: () => void
  // 视频尺寸算出来后回传给上层，让它把透明窗口缩放到视频比例
  onSizeChange?: (width: number, height: number) => void
}

// 返回每个像素的 alpha（0=全透明背景，255=角色，中间=软边渐变）。
// 黑边按亮度抠；白底按「离白近 且 低饱和」从边框泛洪抠，边界给软透明度让白毛边渐隐，
// 而不是留一圈硬白线。角色身上的白肚皮/深色描边因为被金色身体包围、不连边框，不会被误抠。
function keyOutBackground(img: ImageData): Uint8Array {
  const { width, height, data } = img
  const total = width * height

  const lum = new Float32Array(total)
  const wd = new Float32Array(total)
  const sat = new Float32Array(total)
  const wscore = new Float32Array(total)

  for (let i = 0; i < total; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const dr = 255 - r
    const dg = 255 - g
    const db = 255 - b
    const maxC = Math.max(r, g, b)
    const minC = Math.min(r, g, b)
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b
    sat[i] = maxC - minC
    wd[i] = Math.sqrt((dr * dr + dg * dg + db * db) / 3)
  }
  for (let i = 0; i < total; i++) {
    wscore[i] = Math.max(wd[i] / WD_MAX, sat[i] / SAT_MAX)
  }

  // 从四条边框做泛洪，只标记「连到边框」且满足 isBg 的像素
  const flood = (isBg: (idx: number) => boolean): Uint8Array => {
    const visited = new Uint8Array(total)
    const stack: number[] = []

    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return
      }
      const idx = y * width + x
      if (!visited[idx] && isBg(idx)) {
        visited[idx] = 1
        stack.push(idx)
      }
    }

    for (let x = 0; x < width; x++) {
      push(x, 0)
      push(x, height - 1)
    }
    for (let y = 0; y < height; y++) {
      push(0, y)
      push(width - 1, y)
    }

    while (stack.length) {
      const idx = stack.pop()!
      const x = idx % width
      const y = (idx / width) | 0
      push(x - 1, y)
      push(x + 1, y)
      push(x, y - 1)
      push(x, y + 1)
    }

    return visited
  }

  const darkBg = flood((i) => lum[i] <= DARK_LUM)
  const coreWhite = flood((i) => wd[i] < WD_CORE && sat[i] < SAT_CORE)
  const softWhite = flood((i) => wd[i] < WD_MAX && sat[i] < SAT_MAX)

  const alpha = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    if (darkBg[i] || coreWhite[i]) {
      alpha[i] = 0
    } else if (softWhite[i]) {
      // 软边：白度分数从 CORE_SCORE 渐变到 1，alpha 从 0 渐变到 255
      const a = ((wscore[i] - CORE_SCORE) / (1 - CORE_SCORE)) * 255
      alpha[i] = a < 0 ? 0 : a > 255 ? 255 : a
    } else {
      alpha[i] = 255
    }
  }
  return alpha
}

export function TransparentVideo({ src, loop, onEnded, onSizeChange }: TransparentVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const onEndedRef = useRef(onEnded)
  const onSizeChangeRef = useRef(onSizeChange)

  useEffect(() => {
    onEndedRef.current = onEnded
    onSizeChangeRef.current = onSizeChange
  }, [onEnded, onSizeChange])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) {
      return
    }

    let raf = 0
    let disposed = false
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    video.src = src
    video.loop = loop ?? false
    video.playsInline = true
    video.muted = false // 视频自带声音，要出声

    const drawFrame = () => {
      if (disposed) {
        return
      }

      const vw = video.videoWidth
      const vh = video.videoHeight

      if (vw && vh && ctx) {
        const scale = TARGET_LONGEST / Math.max(vw, vh)
        const w = Math.max(1, Math.round(vw * scale))
        const h = Math.max(1, Math.round(vh * scale))

        // 尺寸变了（第一次知道视频尺寸时）就重设画布 + 通知上层调窗口
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
          console.log(`[TransparentVideo] 开始抠背景，视频 ${vw}x${vh} → 显示 ${w}x${h}`)
          onSizeChangeRef.current?.(w, h)
        }

        ctx.drawImage(video, 0, 0, w, h)
        const img = ctx.getImageData(0, 0, w, h)
        const alpha = keyOutBackground(img)

        for (let i = 0; i < alpha.length; i++) {
          img.data[i * 4 + 3] = alpha[i]
        }

        ctx.putImageData(img, 0, 0)
      }

      raf = requestAnimationFrame(drawFrame)
    }

    // 一进来就开循环：metadata 加载前 vw/vh 是 0、会跳过绘制，加载后自动开始画。
    // 不依赖 'playing' 事件，避免事件时序问题导致一帧都不画。
    raf = requestAnimationFrame(drawFrame)

    const end = () => {
      if (disposed) {
        return
      }
      // 非循环：播完一次就停，通知上层回待机
      if (!(loop ?? false)) {
        disposed = true
        cancelAnimationFrame(raf)
        onEndedRef.current?.()
      }
    }

    video.addEventListener('ended', end)
    void video.play().catch(() => {})

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      video.removeEventListener('ended', end)
      video.pause()
      video.removeAttribute('src')
    }
  }, [src, loop])

  return (
    <>
      {/* 用「移出屏幕」而不是 display:none：有些 Chromium 对 display:none 的视频不解码画面 */}
      <video
        ref={videoRef}
        playsInline
        style={{ position: 'fixed', top: 0, left: -99999, width: 10, height: 10, opacity: 0, pointerEvents: 'none' }}
      />
      <canvas ref={canvasRef} className="pet-photo" />
    </>
  )
}
