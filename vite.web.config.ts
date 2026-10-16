import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// 网页版构建：纯 Vite（不是 electron-vite），只打包渲染层，
// 产出可直接部署到静态托管的 index.html + js + css + 静态资源。
// 桌面版构建仍走根目录的 vite.config.ts（electron-vite），两者互不影响。
export default defineConfig({
  root: resolve(__dirname, 'src', 'renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src', 'renderer', 'web.html'),
    },
  },
  preview: {
    headers: {
      // 网页版抠图用 onnxruntime-web 的多线程 wasm，需要跨域隔离；
      // 部署版靠 dist-web/_headers 生效，本地 `npm run preview:web` 也补上这两个头才能本地测抠图。
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
