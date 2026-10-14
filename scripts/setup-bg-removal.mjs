// 把抠图需要的 wasm / mjs / 模型放到 src/renderer/public/bg-removal/，
// 并生成 resources.json，供 @imgly/background-removal 本地加载（不再依赖 CDN）。
// 用法：
//   1) node scripts/download-bg-model.mjs   # 先下载模型（88MB，一次即可）
//   2) node scripts/setup-bg-removal.mjs    # 复制 wasm/mjs + 生成 resources.json

import { copyFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'src', 'renderer', 'public', 'bg-removal')
const ORT_DIST = join(ROOT, 'node_modules', 'onnxruntime-web', 'dist')

const entries = [
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
  {
    key: '/models/isnet_fp16',
    src: join(OUT_DIR, 'isnet_fp16.onnx'),
    out: 'isnet_fp16.onnx',
    mime: 'application/octet-steam',
  },
]

mkdirSync(OUT_DIR, { recursive: true })

const resources = {}
for (const e of entries) {
  const dest = join(OUT_DIR, e.out)
  if (e.src !== dest) {
    copyFileSync(e.src, dest)
  }
  const size = statSync(dest).size
  resources[e.key] = {
    size,
    mime: e.mime,
    chunks: [{ name: e.out, offsets: [0, size] }],
  }
}

writeFileSync(join(OUT_DIR, 'resources.json'), JSON.stringify(resources, null, 2))
console.log('完成。resources.json 内容：')
console.log(JSON.stringify(resources, null, 2))
