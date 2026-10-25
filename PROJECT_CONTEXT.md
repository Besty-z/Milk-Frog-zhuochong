# PROJECT_CONTEXT.md — 项目架构与关键信息

> 只在架构或重要设计变化时更新本文件。日常改动记录在 DEVELOPMENT.md，当前状态在 TASKS.md。

## 一、项目概览

Windows 桌面宠物（奶蛙桌宠）+ 手机浏览器网页版。Electron + React + TypeScript。

- 桌面版：两个窗口 —— **桌宠窗口**（透明、无边框、置顶、skipTaskbar）+ **首页配置窗口**。
- 网页版：同一套 React 组件原样复用，把 `window.desktopPet` 换成浏览器实现，合成「首页 + 浮动桌宠」一个页面。

## 二、目录与模块职责

### 主进程 `src/main/`
| 文件 | 职责 |
|---|---|
| `index.ts` | 应用入口：GPU/SharedArrayBuffer 开关、cache 路径、`pet:get-system-info`、`pet:log-error`、生命周期 |
| `PetWindow.ts` | 桌宠窗口：创建、尺寸/位置、托盘、拖动（setBounds）、点击穿透、`pet:*` 窗口类 IPC |
| `HomeWindow.ts` | 首页窗口（带边框、有任务栏按钮） |
| `PetAssets.ts` | 图片库 + 动作/配置持久化（userData JSON）、文件导入对话框、数据类 IPC、广播给桌宠 |
| `resourcePath.ts` | 用 `app.isPackaged` 区分资源路径（打包读 `process.resourcesPath`，开发读 `../../resources`） |

### 预加载 `src/preload/index.ts`
`contextBridge.exposeInMainWorld('desktopPet', …)`。渲染层所有能力都走这个对象（桌面版走 IPC，网页版走 `web/bridge.ts` 的浏览器实现）。**改 API 要同时改三处**：`preload/index.ts` + `src/renderer/src/vite-env.d.ts`（类型）+ `web/bridge.ts`（网页版实现）。

### 渲染层 `src/renderer/`
- `src/main.tsx` — 唯一桌面入口，按 `?view=home` 渲染 `HomeApp` 或 `App`。
- `src/App.tsx` — 桌宠本体：渲染（静态图/GIF/视频/动作视频片段）+ 交互派发 + 自动大笑。
- `src/HomeApp.tsx` — 首页：导入 / 动作 / 桌宠样式三个标签页。
- `src/modules/` — 业务模块：
  - `AssetManager.ts` — 素材：默认图、`loadPetSprite()`（算人物包围盒 + 裁图）、`hasTransparency()`。
  - `BackgroundRemoval.ts` — `cutoutImage()` / `cutoutFrames()`，动态 import `@imgly/background-removal`。
  - `PetInteraction.ts` — 鼠标：单击/双击/拖动判定 + alpha 点击穿透。
  - `BellyJelly.ts` / `BellyJellyPet.tsx` — 静态图「果冻肚」弹簧形变（canvas 逐行）。
  - `Spin.ts` / `SpinRotator.tsx` — 360° 高速旋转。
  - `PoseActions.ts` — 静态姿势动作注册表（防御/害羞/凝视/搞怪/伤心）。
  - `GifDecoder.ts` / `GifPlayer.tsx` — GIF 解帧、裁剪、播放。
  - `TransparentVideo.tsx` — 动作视频：canvas 抠黑边白底 + 播放（带声）。
  - `DefaultPetActions.ts` — 内置「捧腹大笑」动作。
  - `HomeIcons.tsx` — 内联 SVG 图标。`ActionModule.ts` / `PetRenderer.tsx` — 早期实现，已被果冻肚/姿势系统替代。
- `src/web/` — 网页版：`bridge.ts`（IndexedDB + 事件总线 + PetController，实现整套 `DesktopPetApi`）、
  `WebApp.tsx`（首页 + 浮动桌宠）、`main.tsx`、`web.css`。

## 三、两个关键构建

- **桌面版**：`vite.config.ts`（electron-vite），产出 `out/`（main/preload/renderer 三份）。
- **网页版**：`vite.web.config.ts`（纯 Vite），产出 `dist-web/`（`base: './'`，含抠图模型）。
- 两者独立，互不影响；`tsconfig.json` 同时 include 两者。

## 四、调用关系 / 数据流

- **两个窗口通信靠主进程中转**：首页 `triggerAction/applyImage/…` → 主进程处理并持久化 →
  `sendToPet('pet:…-changed', …)` 广播 → 桌宠窗口订阅 `onTriggerAction/onPetChanged/…` 生效。
- **配置同步套路**（静态姿势/自动大笑/内置动作开关都用它）：两窗口「启动读一次 + 订阅变更」，
  首页改 → `saveXxx` 存盘 → 主进程广播 → 桌宠实时生效。
- **抠图**：导入图 / 默认图 / 姿势图 → `cutoutImage`（首次联网下模型，之后缓存）→ `loadPetSprite`
  算包围盒 + 裁图 + 通知窗口 `setSize`。

## 五、数据持久化（桌面 `userData/` ↔ 网页 IndexedDB）

| 文件 / key | 内容 |
|---|---|
| `pet-library.json` | 图片库 `{ images, currentId }`（每项含 dataUrl/frames/actions/videoActions） |
| `default-pet-cutout.json` | 默认图抠图缓存（版本 `DEFAULT_CUTOUT_VERSION`） |
| `pet-pose-cutouts.json` | 姿势图抠图缓存（`POSE_CUTOUT_VERSION`） |
| `pet-static-action-configs.json` | 静态姿势动作配置（装备/触发/时长/速度/冷却） |
| `pet-auto-laugh-config.json` | 自动大笑规则 `{ enabled, everyNActions }` |
| `pet-builtin-video-action-config.json` | 内置动作视频「应用」开关 |
| `default-pet-video-actions.json` | 默认奶娃的动作视频（只存 `data:` 开头的用户动作） |

## 六、关键设计决策与踩坑（重要，改代码前先看）

1. **移动透明窗口用 `setBounds` 不用 `setPosition`**：Windows 非 100% 缩放下 `setPosition` 会越拖越大。
2. **`@imgly/background-removal` 只有具名导出 `removeBackground`**，没有默认导出（README 写的是默认导入）。
3. **本机 ffmpeg 的 libvpx 丢 alpha**，WebM 透明走不通 → 视频抠背景用渲染层 canvas 连通域/软透明度抠像。
4. **抠图模型 `isnet_fp16.onnx`（88MB）切成 4 片**：Cloudflare Pages 单文件 ≤ 25MB；`resources.json` 里记录分片。
5. **多线程 wasm 需要跨域隔离**：网页版必须带 COOP/COEP 响应头（`vite.web.config.ts` 的 preview.headers + `dist-web/_headers`），主进程用 `--enable-features=SharedArrayBuffer`。
6. **改主进程/preload 后 electron-vite dev 不自动重启 Electron**，需手动重启 `npm run dev`。
7. **内置动作不进持久化**：写 `default-pet-video-actions.json` 前要 `filter(!isBuiltinVideoAction)`，否则内置动作被误写成用户动作造成重复。
8. **换默认桌宠图记得 `DEFAULT_CUTOUT_VERSION` +1**，否则旧透明图缓存不失效。
9. **网页版隐藏类名是 `web-pet-float--hidden`（BEM）**，`WebApp.tsx` 与 `web.css` 要一致。
10. **本机 shell 设了 `ELECTRON_RUN_AS_NODE=1`** 时 Electron 被当纯 Node 跑、窗口起不来，属环境限制非代码问题。

## 七、已知环境约束（来自 DEVELOPMENT.md）

- 某些会话读不出图片内容（显示 Unsupported Image），导致无法亲眼看桌宠/图标效果 → GUI 需用户实测。
- `.npmrc` 把 electron / electron-builder 走阿里云镜像（国内下 GitHub 会超时）。
