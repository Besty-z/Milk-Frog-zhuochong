import petImage from '../assets/pet.jpg'

// AssetManager：管理角色素材。默认是一张本地占位图；
// Phase B：导入图片 → 自动抠图 → 算人物包围盒 → 窗口收紧到人物。
// 这里负责最后一步：算出「非透明像素的包围盒」，把图裁到包围盒，
// 窗口尺寸也跟着变成包围盒的比例（透明区不再挡点击，桌宠也更贴）。

// 目标显示宽度（像素）。抠图/包围盒后，高度按包围盒比例跟着算。
const PET_TARGET_WIDTH = 150

// 默认素材（还没导入任何图片时用这张）
export function getDefaultPetImage(): string {
  return petImage
}

// 包围盒：图片里「非透明像素」的最小外接矩形（坐标是原图像素）。
interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

// 一个算好的桌宠「精灵图」：裁好的图 + 窗口尺寸 + 点击穿透用的 alpha 图。
export interface PetSprite {
  dataUrl: string
  width: number
  height: number
  alphaCanvas: HTMLCanvasElement
}

// 按目标宽 150 等比例算出窗口显示尺寸（静态图和动图通用）。
export function displaySizeFor(naturalWidth: number, naturalHeight: number): { width: number; height: number } {
  const width = PET_TARGET_WIDTH
  const height = Math.max(1, Math.round((width * naturalHeight) / naturalWidth))
  return { width, height }
}

// 扫描整张图，找出 alpha > 0 的像素范围。全图不透明（比如原图 jpg）时结果就是整图。
function computeBounds(canvas: HTMLCanvasElement): Bounds {
  const { width, height } = canvas
  const context = canvas.getContext('2d')

  if (!context) {
    return { x: 0, y: 0, width, height }
  }

  const { data } = context.getImageData(0, 0, width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    const rowStart = y * width
    for (let x = 0; x < width; x++) {
      if (data[(rowStart + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  // 一个非透明像素都没有（几乎不可能）就退回整图，避免除零
  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height }
  }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

// 把图片裁到人物包围盒，返回裁好的图 + 对应窗口尺寸 + alpha 图。
export function loadPetSprite(imageUrl: string): Promise<PetSprite> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      const naturalWidth = image.naturalWidth
      const naturalHeight = image.naturalHeight

      const fullCanvas = document.createElement('canvas')
      fullCanvas.width = naturalWidth
      fullCanvas.height = naturalHeight
      const fullContext = fullCanvas.getContext('2d')

      if (!fullContext) {
        reject(new Error('无法创建画布'))
        return
      }

      fullContext.drawImage(image, 0, 0)

      const bounds = computeBounds(fullCanvas)

      // 裁出包围盒区域
      const cropped = document.createElement('canvas')
      cropped.width = bounds.width
      cropped.height = bounds.height
      const croppedContext = cropped.getContext('2d')

      if (!croppedContext) {
        reject(new Error('无法创建画布'))
        return
      }

      croppedContext.drawImage(
        fullCanvas,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height,
      )

      const { width, height } = displaySizeFor(bounds.width, bounds.height)

      resolve({
        dataUrl: cropped.toDataURL('image/png'),
        width,
        height,
        alphaCanvas: cropped,
      })
    }

    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = imageUrl
  })
}
