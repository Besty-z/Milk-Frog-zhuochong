// 从一张照片生成托盘图标 PNG（16x16 / 32x32）。
// 用法：npx electron scripts/make-tray-icon.js <图片路径>
// 输出：resources/tray-16.png 和 resources/tray-32.png
const { app, nativeImage } = require('electron')
const { mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')

const src = process.argv[2]
const outDir = join(__dirname, '..', 'resources')

app.whenReady().then(() => {
  const img = nativeImage.createFromPath(src)

  if (img.isEmpty()) {
    console.error('无法读取图片:', src)
    app.exit(1)
    return
  }

  const { width, height } = img.getSize()
  const side = Math.min(width, height)

  // 居中裁成正方形，避免缩放变形
  const square = img.crop({
    x: Math.round((width - side) / 2),
    y: Math.round((height - side) / 2),
    width: side,
    height: side,
  })

  mkdirSync(outDir, { recursive: true })

  for (const size of [16, 32]) {
    const out = join(outDir, `tray-${size}.png`)
    writeFileSync(out, square.resize({ width: size, height: size, quality: 'best' }).toPNG())
    console.log('生成:', out)
  }

  app.exit(0)
})
