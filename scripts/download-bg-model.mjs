// 从 IMG.LY CDN 下载抠图模型分片，拼成单个 .onnx 文件，用于本地自托管。
// 用法：node scripts/download-bg-model.mjs
// 说明：@imgly/background-removal 默认从 CDN 分片下载模型；CDN 上有个 wasm 分片 404，
//       所以把模型和 wasm 都放到本地（src/renderer/public/bg-removal/），运行时不再依赖 CDN。

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_PATH = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist'
const KEY = '/models/isnet_fp16'
const OUT = join(__dirname, '..', 'src', 'renderer', 'public', 'bg-removal', 'isnet_fp16.onnx')

async function fetchChunk(url, expectSize, attempt) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length !== expectSize) throw new Error(`size ${buf.length} != ${expectSize}`)
  return buf
}

async function main() {
  const res = await fetch(`${PUBLIC_PATH}/resources.json`)
  if (!res.ok) throw new Error(`resources.json HTTP ${res.status}`)
  const map = await res.json()
  const entry = map[KEY]
  if (!entry) throw new Error(`resources.json 里没有 ${KEY}`)

  mkdirSync(dirname(OUT), { recursive: true })

  const parts = []
  let downloaded = 0

  for (let i = 0; i < entry.chunks.length; i++) {
    const chunk = entry.chunks[i]
    const size = chunk.offsets[1] - chunk.offsets[0]
    const url = `${PUBLIC_PATH}/${chunk.name}`

    let buf = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        buf = await fetchChunk(url, size, attempt)
        break
      } catch (e) {
        console.error(`  分片 ${i + 1}/${entry.chunks.length} 第 ${attempt} 次失败：${e.message}`)
      }
    }
    if (!buf) throw new Error(`分片 ${i + 1} 下载失败`)

    parts.push(buf)
    downloaded += buf.length
    process.stdout.write(`\r  进度 ${i + 1}/${entry.chunks.length} 分片，${(downloaded / 1024 / 1024).toFixed(1)} MB`)
  }

  const total = Buffer.concat(parts)
  if (total.length !== entry.size) {
    throw new Error(`拼完后大小 ${total.length} 与预期 ${entry.size} 不符`)
  }

  writeFileSync(OUT, total)
  console.log(`\n完成：${OUT}（${total.length} 字节）`)
}

main().catch((e) => {
  console.error('\n下载失败：', e)
  process.exit(1)
})
