// 网页版构建后把 web.html 改成 index.html，方便静态托管当作默认首页直接访问。
import { renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'dist-web', 'web.html')
const to = join(root, 'dist-web', 'index.html')

if (existsSync(from)) {
  renameSync(from, to)
  console.log('已重命名 dist-web/web.html → dist-web/index.html')
} else {
  console.error('未找到 dist-web/web.html，跳过重命名')
  process.exit(1)
}
