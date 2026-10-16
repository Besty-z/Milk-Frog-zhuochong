import { app } from 'electron'
import { join } from 'node:path'

// 打包后，resources/（图标、托盘图）被 electron-builder 的 extraResources 复制到
// <安装目录>/resources/resources/；开发时它们就在项目根目录 resources/。
// 这里统一解析，两种环境都能拿到图标路径。
export function resourcePath(...segments: string[]): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', ...segments)
    : join(__dirname, '../../resources', ...segments)
}
