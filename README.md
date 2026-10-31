# 奶蛙桌宠 · Milk Frog's Beast-Bond Sutra

把任意图片 / GIF / 视频，一键变成一只**会动、会叫、能拖能点**的桌面宠物。
支持 **Windows 桌面版** 和 **网页版**（电脑、手机浏览器都能玩）。

## ✨ 立即体验（网页版，无需安装）

电脑或手机浏览器直接打开下面的链接即可使用：

👉 **https://milk-frog-s-beast-bond-sutra.pages.dev/**

打开后浏览器右下角会出现一只浮动桌宠，同时显示「首页」配置界面。功能与桌面版一致，数据保存在本地（IndexedDB），关掉浏览器也不会丢。

## 功能特性

- **导入即抠图**：导入任意图片 / GIF / 视频，本地自动抠出人物（离线可用，图片不会上传到任何服务器）。
- **多种形态**：静态图、GIF 动图、MP4 / WebM / MOV 视频都能当桌宠。
- **一堆动作**：待机、开心（果冻肚晃动）、360° 旋转、静态姿势（防御 / 害羞 / 凝视 / 搞怪 / 伤心）、动作视频（自动抠黑边白底、还能配音）。
- **动作随心配**：每个动作可单独装备，自定义触发方式、时长、速度、冷却时间。
- **内置彩蛋**：默认奶蛙自带「捧腹大笑」动作（带声），点桌宠就播；还能设置「每 N 次动作自动大笑」。
- **桌面版专属**：透明、无边框、置顶的桌宠窗口；支持拖动、单击、双击，透明区域可点击穿透到桌面；系统托盘可显示 / 隐藏 / 回到屏幕内 / 退出。
- **记住你的设置**：桌宠可命名 / 重命名，所有配置自动保存，重启不丢。

## 快速上手

1. **打开首页**
   - 网页版：直接打开上面的链接，首页 + 桌宠一起出现。
   - 桌面版：右键系统托盘里的奶蛙图标 →「打开首页」。
2. **导入图片**：在「导入」页选一张图片（或 GIF / 视频），等它自动抠图完成。
3. **打扮它**：在「动作」和「桌宠样式」页切换动作、装备姿势、给它起名字。

桌面版里，直接拖动桌宠就能移动位置，单击 / 双击触发它的动作。

## 技术栈

| 用途 | 技术 |
|---|---|
| 桌面端框架 | Electron 37 · React 19 · TypeScript 5.9 |
| 构建 | electron-vite 4 · Vite 7 |
| 打包 | electron-builder 26（NSIS + portable） |
| 自动抠图 | @imgly/background-removal 1.7（onnxruntime-web，本地推理） |
| GIF 解码 | gifuct-js |
| 网页版 | 纯 Vite（`vite.web.config.ts`）+ IndexedDB |

## 目录结构

```text
src/main/                   Electron 主进程
  index.ts                  应用入口 + 生命周期 + 系统级 IPC
  PetWindow.ts              桌宠窗口（透明/置顶/托盘/拖动/点击穿透/位置保存）
  HomeWindow.ts             首页配置窗口
  PetAssets.ts              图片库、动作/配置持久化、文件导入、大部分 IPC
  resourcePath.ts           资源路径（打包版 vs 开发版）
src/preload/index.ts        安全桥接，把 window.desktopPet 暴露给渲染层
src/renderer/
  index.html                桌面版 HTML 入口
  web.html                  网页版 HTML 入口
  src/main.tsx              入口：按 ?view=home 切换 HomeApp / App
  src/App.tsx               桌宠本体窗口
  src/HomeApp.tsx           首页配置窗口（三个标签页）
  src/styles.css            桌宠窗口样式（透明窗口，勿加背景）
  src/home.css              首页样式（紫色主题，受 html.home-page 隔离）
  src/modules/              业务模块（见 PROJECT_CONTEXT.md）
  src/web/                  网页版：bridge.ts（浏览器版 API）+ WebApp.tsx + web.css
  public/bg-removal/        抠图模型 + wasm 运行时（由 scripts 生成，git 忽略）
resources/                  托盘图标、窗口图标（tray-16/32.png、icon.png）
scripts/                    模型下载、抠图资源整理、图标生成等脚本
```

## 环境要求

- **Node.js ≥ 20.19**（Vite 7 的要求；`package.json` 未显式声明 `engines`，以实际能跑通为准）。
- npm（随 Node 一起安装）。
- 桌面版与打包需要 **Windows**；网页版跨平台。

## 安装与运行（开发）

```powershell
npm install
npm run dev        # 桌面版开发（electron-vite，自动开窗口 + HMR）
```

改到主进程 / preload 后，electron-vite 不会自动重启 Electron，需手动重启 `npm run dev`。

## 网页版

```powershell
npm run build:web    # 构建到 dist-web/
npm run preview:web  # 本地预览（已带 COOP/COEP 头，可本地测抠图）
```

部署到静态托管时需支持自定义响应头（COOP/COEP），否则多线程 wasm 抠图会报 SharedArrayBuffer 错误。官方链接已配置好，直接用即可；自己部署时才需要处理。

## 构建与打包

```powershell
npm run typecheck  # 仅 TypeScript 类型检查
npm run build      # 桌面版构建（主进程 + preload + renderer）
npm run pack       # 构建 + electron-builder --dir（未压缩目录）
npm run dist       # 构建 + 出安装包到 release/（*.exe）
```

## 常见问题

- **第一次抠图比较慢？** 首次抠图需要联网下载抠图模型，之后会缓存，再抠就快了、也能离线用。
- **网页版抠图报 SharedArrayBuffer 错误？** 这是部署服务器缺少 COOP/COEP 响应头导致的，见上「网页版」一节。
- **桌宠跑到屏幕外找不到了？** 桌面版右键托盘图标 →「回到屏幕内」。

## 文档入口

- [AGENTS.md](AGENTS.md) — 智能体工作规则（开始 / 修改 / 验证 / 收尾 / 交接）
- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — 架构、模块职责、调用关系、数据持久化、踩坑记录
- [TASKS.md](TASKS.md) — 当前进度与待办
- [docs/HANDOFF.md](docs/HANDOFF.md) — 最近一次交接记录（新会话从这里恢复）
- [DEVELOPMENT.md](DEVELOPMENT.md) — 完整开发日志（每次改动的背景 / 验证 / 待办）
