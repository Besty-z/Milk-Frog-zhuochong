// BackgroundRemoval：调用 @imgly/background-removal 做自动抠图。
// 库比较重（onnxruntime + wasm + 模型），所以用「动态 import」——
// 只有用户真的点「抠图」时才加载，桌宠小窗口平时不背这个包袱。
//
// 模型和 wasm 已经「自托管」到本地：src/renderer/public/bg-removal/。
// 原因是 IMG.LY 的 CDN 上有个 wasm 分片 404（会报 "Invalid format: text/html"），
// 所以不再走 CDN，运行时直接读本地文件（由 scripts/setup-bg-removal.mjs 生成）。

export type CutoutProgress = (key: string, current: number, total: number) => void

// 算出本地资源目录的绝对 URL：
// - dev：Vite 把 public/ 伺服在 http://localhost:xxxx/，所以是 .../bg-removal/
// - 打包后：文件跟着 index.html 的相对路径 bg-removal/
function resolvePublicPath(): string {
  return new URL('bg-removal/', window.location.href).toString()
}

// 传入图片（dataURL 字符串），返回抠掉背景后的透明 PNG dataURL。
export async function cutoutImage(
  imageSrc: string,
  onProgress?: CutoutProgress,
): Promise<string> {
  const { removeBackground } = await import('@imgly/background-removal')

  const blob = await removeBackground(imageSrc, {
    // 用本地自托管的模型 + wasm，不再依赖 CDN
    publicPath: resolvePublicPath(),
    // 主进程关了 GPU，这里用 cpu 跑 onnx（首次会慢一点，但稳定）
    device: 'cpu',
    progress: (key, current, total) => {
      onProgress?.(key, current, total)
    },
  })

  return blobToDataUrl(blob)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取抠图结果失败'))
    reader.readAsDataURL(blob)
  })
}

export type CutoutFramesProgress = (done: number, total: number) => void

// 对一串帧逐帧抠背景，返回透明 PNG dataURL 数组。帧很多时比较慢，onProgress 报进度。
export async function cutoutFrames(
  frames: string[],
  onProgress?: CutoutFramesProgress,
): Promise<string[]> {
  const { removeBackground } = await import('@imgly/background-removal')
  const publicPath = resolvePublicPath()
  const result: string[] = []

  for (let i = 0; i < frames.length; i++) {
    const blob = await removeBackground(frames[i], { publicPath, device: 'cpu' })
    result.push(await blobToDataUrl(blob))
    onProgress?.(i + 1, frames.length)
  }

  return result
}
