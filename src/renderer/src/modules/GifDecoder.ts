import { parseGIF, decompressFrames, type ParsedFrame } from 'gifuct-js'

// GifDecoder：把一张 GIF 解成一串帧。分工——
// - decodeGifFrames：解帧 + 按 disposal 规则合成完整帧（未裁剪）
// - cropGifFrames：算所有帧「非透明像素并集包围盒」，逐帧裁剪 + 生成点击穿透用的并集 alpha 图
// - downscaleDataUrl / dataUrlToCanvas：小工具
// 桌宠窗口和首页预览共用。

export interface GifFrame {
  dataUrl: string
  delay: number // 毫秒
}

// 解帧后的原始结果：完整帧（未裁剪）+ 原始宽高 + 每帧延迟
export interface GifFrames {
  width: number
  height: number
  frames: string[]
  delays: number[]
}

// 裁剪 + 并集 alpha 之后的结果
export interface CroppedGif {
  frames: string[]
  width: number
  height: number
  alphaDataUrl: string
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
}

function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  return fetch(dataUrl).then((resp) => resp.arrayBuffer())
}

// 把 gifuct-js 的 patch（RGBA，透明像素 alpha=0）画到目标画布上。
// 用 drawImage 而不是 putImageData，这样透明像素会「留空」而不是把下面的像素抹掉。
function drawPatch(context: CanvasRenderingContext2D, frame: ParsedFrame) {
  const { top, left, width, height } = frame.dims

  const temp = document.createElement('canvas')
  temp.width = width
  temp.height = height
  const tempContext = temp.getContext('2d')

  if (!tempContext) {
    return
  }

  const imageData = tempContext.createImageData(width, height)
  imageData.data.set(frame.patch)
  tempContext.putImageData(imageData, 0, 0)
  context.drawImage(temp, left, top)
}

export async function decodeGifFrames(dataUrl: string): Promise<GifFrames> {
  const buffer = await dataUrlToArrayBuffer(dataUrl)
  const gif = parseGIF(buffer)
  const parsedFrames = decompressFrames(gif, true)

  if (parsedFrames.length === 0) {
    throw new Error('这张动图里没有帧，可能不是有效的 GIF')
  }

  const width = gif.lsd.width
  const height = gif.lsd.height

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('无法创建画布')
  }

  // 合成出每一帧的完整画面，同时处理 GIF 的 disposal（清空/恢复上一帧）
  const fullFrames: ImageData[] = []
  let snapshotBeforePrev: ImageData | null = null

  parsedFrames.forEach((frame, i) => {
    if (i > 0) {
      const prev = parsedFrames[i - 1]

      if (prev.disposalType === 2) {
        context.clearRect(0, 0, width, height)
      } else if (prev.disposalType === 3 && snapshotBeforePrev) {
        context.putImageData(snapshotBeforePrev, 0, 0)
      }
    }

    const beforeDraw = context.getImageData(0, 0, width, height)
    drawPatch(context, frame)
    fullFrames.push(context.getImageData(0, 0, width, height))
    snapshotBeforePrev = beforeDraw
  })

  const frames = fullFrames.map((imageData) => {
    context.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  })
  const delays = parsedFrames.map((parsed) => Math.max(20, parsed.delay || 100))

  return { width, height, frames, delays }
}

// 把 dataUrl 缩到最大边长 maxDim（小于它就不动），返回新 dataUrl。抠图前用它提速。
export async function downscaleDataUrl(dataUrl: string, maxDim: number): Promise<string> {
  const image = await loadImage(dataUrl)
  const width = image.naturalWidth
  const height = image.naturalHeight

  if (width <= maxDim && height <= maxDim) {
    return dataUrl
  }

  const scale = maxDim / Math.max(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL('image/png')
}

// 算所有帧的「非透明像素并集包围盒」，逐帧裁剪，并生成并集 alpha 图（dataUrl）。
export async function cropGifFrames(frames: string[]): Promise<CroppedGif> {
  const first = await loadImage(frames[0])
  const width = first.naturalWidth
  const height = first.naturalHeight

  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = width
  fullCanvas.height = height
  const fullContext = fullCanvas.getContext('2d')!

  // 并集 alpha：任一帧不透明就算不透明
  const opaque = new Uint8Array(width * height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (const frameUrl of frames) {
    const image = await loadImage(frameUrl)
    fullContext.clearRect(0, 0, width, height)
    fullContext.drawImage(image, 0, 0)
    const data = fullContext.getImageData(0, 0, width, height).data

    for (let y = 0; y < height; y++) {
      const rowStart = y * width

      for (let x = 0; x < width; x++) {
        if (data[(rowStart + x) * 4 + 3] > 0) {
          opaque[rowStart + x] = 1

          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
  }

  // 整张动图全透明（几乎不可能）就退回整图
  if (maxX < minX || maxY < minY) {
    minX = 0
    minY = 0
    maxX = width - 1
    maxY = height - 1
  }

  const boundsWidth = maxX - minX + 1
  const boundsHeight = maxY - minY + 1

  const cropCanvas = document.createElement('canvas')
  cropCanvas.width = boundsWidth
  cropCanvas.height = boundsHeight
  const cropContext = cropCanvas.getContext('2d')!

  const croppedFrames: string[] = []

  for (const frameUrl of frames) {
    const image = await loadImage(frameUrl)
    cropContext.clearRect(0, 0, boundsWidth, boundsHeight)
    cropContext.drawImage(image, minX, minY, boundsWidth, boundsHeight, 0, 0, boundsWidth, boundsHeight)
    croppedFrames.push(cropCanvas.toDataURL('image/png'))
  }

  // 并集 alpha 图
  const alphaCanvas = document.createElement('canvas')
  alphaCanvas.width = boundsWidth
  alphaCanvas.height = boundsHeight
  const alphaContext = alphaCanvas.getContext('2d')!
  const alphaImage = alphaContext.createImageData(boundsWidth, boundsHeight)

  for (let y = 0; y < boundsHeight; y++) {
    for (let x = 0; x < boundsWidth; x++) {
      const srcIndex = (y + minY) * width + (x + minX)
      alphaImage.data[(y * boundsWidth + x) * 4 + 3] = opaque[srcIndex] ? 255 : 0
    }
  }

  alphaContext.putImageData(alphaImage, 0, 0)

  return {
    frames: croppedFrames,
    width: boundsWidth,
    height: boundsHeight,
    alphaDataUrl: alphaCanvas.toDataURL('image/png'),
  }
}

export async function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const image = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  canvas.getContext('2d')!.drawImage(image, 0, 0)
  return canvas
}

// 把「帧数组 + 延迟数组」合并成 GifPlayer 要的 GifFrame[]。运行时直接给播放器，不用再解码。
export function framesWithDelays(frames: string[], delays: number[]): GifFrame[] {
  return frames.map((dataUrl, i) => ({ dataUrl, delay: delays[i] ?? 100 }))
}
