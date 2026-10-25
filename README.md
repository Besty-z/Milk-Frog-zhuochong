# Milk Frog's Beast-Bond Sutra（奶蛙桌宠）

一个用 **Electron + React + TypeScript** 开发的 Windows 桌面宠物，附带**手机浏览器可用的网页版**。

核心玩法：导入任意图片 / GIF / 视频 → 自动抠出人物 → 变成能拖、能点、会动、会叫的桌宠。

## 功能状态（已实现）

- 透明、无边框、置顶的桌宠窗口；支持拖动、单击、双击、点击穿透（透明区域穿透到桌面）。
- 系统托盘：显示 / 隐藏 / 回到屏幕内 / 打开首页 / 退出；窗口位置持久化。
- 首页（配置窗口）三个标签页：**导入**、**动作**、**桌宠样式**（图片库）。
- 导入任意图片 → 本地自动抠图（`@imgly/background-removal`，ONNX/WASM，离线可用）。
- 支持**静态图 / GIF 动图 / MP4·WebM·MOV 视频**当桌宠。
- 动作系统：待机、开心（果冻肚晃动）、360° 旋转、静态姿势动作（防御/害羞/凝视/搞怪/伤心）、
  动作视频片段（自动抠黑边白底、可配音）；每个动作可独立装备、自定义触发方式、时长、速度、冷却。
- 默认奶蛙内置「捧腹大笑」动作（带声），点桌宠即播；可配置「每 N 次动作自动大笑」。
- 桌宠可命名 / 重命名；所有配置持久化（重启不丢）。
- 网页版：浏览器内右下角浮动桌宠，复用同一套组件，数据存 IndexedDB。

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

## 安装与运行

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

部署到静态托管时需支持自定义响应头（COOP/COEP），否则多线程 wasm 抠图会报 SharedArrayBuffer 错误；详见 DEVELOPMENT.md。

## 构建与打包

```powershell
npm run typecheck  # 仅 TypeScript 类型检查
npm run build      # 桌面版构建（主进程 + preload + renderer）
npm run pack       # 构建 + electron-builder --dir（未压缩目录）
npm run dist       # 构建 + 出安装包到 release/（*.exe）
```

## 常见问题

关键踩坑记录（详见 DEVELOPMENT.md，下面只列最常见几条）：

- **移动透明窗口要用 `setBounds` 而不是 `setPosition`**，否则 Windows 非 100% 缩放下会越拖越大。
- `@imgly/background-removal` 只有**具名导出** `removeBackground`，没有默认导出。
- 抠图模型 `isnet_fp16.onnx`（88MB）被切成 4 片，是因为 Cloudflare Pages 单文件 ≤ 25MB。
- 网页版「隐藏/显示」的类名是 `web-pet-float--hidden`（BEM），改 WebApp.tsx 和 web.css 要同步。
- 换默认桌宠图时记得把 `PetAssets.ts` 里的 `DEFAULT_CUTOUT_VERSION` +1，否则旧透明图缓存不失效。

## 文档入口

- [AGENTS.md](AGENTS.md) — 智能体工作规则（开始 / 修改 / 验证 / 收尾 / 交接）
- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — 架构、模块职责、调用关系、数据持久化
- [TASKS.md](TASKS.md) — 当前进度与待办
- [docs/HANDOFF.md](docs/HANDOFF.md) — 最近一次交接记录（新会话从这里恢复）
- [DEVELOPMENT.md](DEVELOPMENT.md) — 完整开发日志（每次改动的背景 / 验证 / 待办）
