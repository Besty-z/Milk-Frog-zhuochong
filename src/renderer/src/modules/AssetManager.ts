import petImage from '../assets/pet.jpg'

// AssetManager：管理角色素材。现在只有一张固定的本地图片；
// Phase B 会扩展成「导入图片 → 自动抠图 → 算包围盒 → 缓存」，这里就是入口。

// 目标显示宽度（像素）。抠图后这里会改成「包围盒宽度」。
const PET_TARGET_WIDTH = 150

export function getPetImageUrl(): string {
  return petImage
}

// 加载图片，算出等比例的显示尺寸
export function loadPetDisplaySize(): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      const width = PET_TARGET_WIDTH
      const height = Math.round((width * image.naturalHeight) / image.naturalWidth)
      resolve({ width, height })
    }
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = petImage
  })
}

// 把图片画进离屏画布，供点击穿透时读取每个像素的透明度。
// （未来抠图后，也用它来算人物包围盒。）
export function loadPetAlphaMap(): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')

      if (!context) {
        reject(new Error('无法创建画布'))
        return
      }

      context.drawImage(image, 0, 0)
      resolve(canvas)
    }
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = petImage
  })
}
