// 把抠图需要的 wasm / mjs / 模型放到 src/renderer/public/bg-removal/，
// 并生成 resources.json，供 @imgly/background-removal 本地加载（不再依赖 CDN）。
//
// 模型会切成多片：Cloudflare Pages 等静态托管限制「单文件 ≤ 25MB」，
// 而 isnet_fp16.onnx 有 88MB，必须切到每片 < 25MB 才能部署。
//
// 用法：
//   1) node scripts/download-bg-model.mjs   # 先下载模型（88MB，一次即可）
//   2) node scripts/setup-bg-removal.mjs    # 复制 wasm/mjs + 切分模型 + 生成 resources.json

import {
  copyFileSync,
  readFileSync,
  writeFileSync,
  statSync,
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'src', 'renderer', 'public', 'bg-removal')
const ORT_DIST = join(ROOT, 'node_modules', 'onnxruntime-web', 'dist')

// 模型切几片：88MB / 4 ≈ 22MB，低于 Cloudflare Pages 的 25MB 单文件上限
const MODEL_CHUNK_COUNT = 4
const MODEL_MIME = 'application/octet-steam'

mkdirSync(OUT_DIR, { recursive: true })

const resources = {}

// 1) wasm / mjs 体积小，单文件即可
const smallEntries = [
  {
    key: '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
    src: join(ORT_DIST, 'ort-wasm-simd-threaded.wasm'),
    out: 'ort-wasm-simd-threaded.wasm',
    mime: 'application/wasm',
  },
  {
    key: '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
    src: join(ORT_DIST, 'ort-wasm-simd-threaded.mjs'),
    out: 'ort-wasm-simd-threaded.mjs',
    mime: 'text/javascript',
  },
]

for (const e of smallEntries) {
  const dest = join(OUT_DIR, e.out)
  if (e.src !== dest) copyFileSync(e.src, dest)
  const size = statSync(dest).size
  resources[e.key] = { size, mime: e.mime, chunks: [{ name: e.out, offsets: [0, size] }] }
}

// 2) 模型：如果还是单个大文件，切成多片
const single = join(OUT_DIR, 'isnet_fp16.onnx')
if (existsSync(single)) {
  const buf = readFileSync(single)
  const partSize = Math.ceil(buf.length / MODEL_CHUNK_COUNT)
  let i = 0
  for (let start = 0; start < buf.length; start += partSize) {
    const end = Math.min(start + partSize, buf.length)
    writeFileSync(join(OUT_DIR, `isnet_fp16.${i}.onnx`), buf.subarray(start, end))
    i++
  }
  // 删掉单个大文件，避免突破托管单文件上限；Windows 下可能被临时占用，加重试 + 失败即报错
  rmSync(single, { force: true, maxRetries: 5, retryDelay: 200 })
  if (existsSync(single)) {
    throw new Error(`删除 ${single} 失败（可能被占用），请手动删除后再试`)
  }
}

// 3) 根据实际存在的分片重建 resources.json 里的模型条目（按字节顺序）
const partNames = readdirSync(OUT_DIR)
  .filter((f) => /^isnet_fp16\.\d+\.onnx$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
if (partNames.length === 0) {
  throw new Error(`没有模型文件，请先运行 node scripts/download-bg-model.mjs`)
}

const modelChunks = []
let offset = 0
let total = 0
for (const name of partNames) {
  const size = statSync(join(OUT_DIR, name)).size
  modelChunks.push({ name, offsets: [offset, offset + size] })
  offset += size
  total += size
}
resources['/models/isnet_fp16'] = { size: total, mime: MODEL_MIME, chunks: modelChunks }

writeFileSync(join(OUT_DIR, 'resources.json'), JSON.stringify(resources, null, 2))
console.log(`完成：模型切成 ${modelChunks.length} 片，共 ${total} 字节`)
console.log(JSON.stringify(resources, null, 2))
