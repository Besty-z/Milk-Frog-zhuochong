# 开发记录

> 每次改动记一条：背景 → 做了什么 → 验证结果 → 待办。方便下次直接接着开发。

---

## 2026-10-13 — 检查 Electron 架构，定位托盘图标 bug（未改代码）

### 背景
用户让我检查这个 Electron 桌宠项目有没有问题。

### 做了什么（只诊断，没有修改任何代码）
- 通读了主进程、preload、渲染进程和构建配置。
- 运行 `npm run typecheck` → ✅ 通过。
- 运行 `npm run build` → ✅ 通过。
- 确认代码结构本身是对的：
  - preload 输出为 CommonJS，`sandbox: true` + `contextBridge` 安全桥接正确；
  - `__dirname` 相对路径（`../preload/index.js`、`../renderer/index.html`）正确；
  - React 渲染层、窗口拖动/隐藏/关闭、位置保存逻辑都正常。

### 发现的问题

#### 🔴 关键 bug：托盘图标永远创建不出来
- 位置：`src/main/index.ts` 的 `createTray()`（约 69–83 行）。
- 原因：`nativeImage.createFromDataURL()` 只支持 PNG / JPEG，**不支持 SVG**。
  所以 Windows 上 `icon.isEmpty()` 为 `true`，`createTray()` 提前 `return`，托盘图标根本不存在。
- 后果：点「隐藏桌宠」后窗口消失，但没有托盘图标能恢复，桌宠就找不回来了。
  README「第二阶段验证」第 4 条会失败。
- 修法：改用真正的 PNG 图标文件，用 `nativeImage.createFromPath()` 加载。

#### 🟡 小建议（不影响运行，可后续做）
1. 恢复窗口位置时没有做屏幕边界校验——拔掉外接显示器后，窗口可能恢复到屏幕外看不到。
   （`src/main/index.ts` 的 `readSavedPosition()`）
2. `disable-gpu` + `disable-gpu-compositing` + `disableHardwareAcceleration()` 三行冗余，
   精简成一行 `app.disableHardwareAcceleration()` 即可。

### 澄清的概念（教学）
- Electron 渲染进程跑的就是 Chromium，**CSS 完全支持**，现在纯 CSS 画的桌宠正常。
- 系统托盘是 Windows 原生区域，**不能放 HTML/CSS**，只能给一张 PNG / ICO 图片文件。
  这两个是两回事，别混在一起。

### 待办 / 下一步
- [ ] 等用户提供桌宠照片（上次发的图没能读出来，需要重新传）。
- [ ] 用照片生成托盘 PNG 图标（16×16 / 32×32），替换掉不生效的 SVG。
- [ ] 决定是否用照片替换纯 CSS 桌宠本体（`<img>` 显示）。
- [ ] 可选：加窗口位置边界校验、精简 GPU 开关。

---

## 2026-10-13（续）— 用照片生成托盘图标，修复托盘 bug

### 背景
用户提供了桌宠照片（根目录 `b5a0a55738ef15e6749d616d99ddb89d.jpg`，1079×1334 的 JPEG，约 208KB）。用它修托盘 bug。

### 改了哪些文件
- 新增 `scripts/make-tray-icon.js`：用 Electron 自带的 `nativeImage` 把照片**居中裁成正方形**再缩放，生成托盘 PNG。
- 新增 `resources/tray-16.png`（16×16）和 `resources/tray-32.png`（32×32）。
- 修改 `src/main/index.ts` 的 `createTray()`：删掉原来不生效的 SVG 图标，改用
  `nativeImage.createFromPath(join(__dirname, '../../resources/tray-16.png'))`。

### 验证结果（实际跑过）
- 图标生成成功；PNG 签名和尺寸校验通过（16×16、32×32 都对）。
- `npm run typecheck` ✅、`npm run build` ✅。

### 注意 / 待办
- 本会话读不出图片内容（图片显示 Unsupported Image），所以看不到照片长什么样，
  也没法亲眼确认托盘图标好不好看。需要用户 `npm run dev` 后到托盘确认；
  如果糊或难看，可换用 32 的图，或重新做一张干净的图标。
- 本会话的 shell 会设置 `ELECTRON_RUN_AS_NODE=1`，跑 electron 脚本前要用
  `env -u ELECTRON_RUN_AS_NODE` 去掉它，否则 electron 被当成纯 Node 跑、拿不到 API。
- 照片目前**只用来做了托盘图标**，还没用来当桌宠本体（下一步决定）。
- [ ] 决定是否用照片替换/结合 CSS 桌宠本体
- [ ] 原始照片 `b5a0a55738ef15e6749d616d99ddb89d.jpg` 整理到 `resources/` 并重命名

---

## 2026-10-13（再续）— 把照片接成桌宠本体

### 背景
用户反馈「没有我的图片」——原来照片只做了 16×16 的托盘图标（几乎看不见），窗口里还是 CSS 画的青蛙。用户要的是照片直接显示成桌宠本体。

### 改了哪些文件
- 新增 `src/renderer/src/assets/pet.jpg`（从根目录照片复制进来，交给 Vite 打包）。
- 修改 `src/renderer/src/App.tsx`：`import petImage from './assets/pet.jpg'`，把原来 CSS 青蛙的耳朵/脸/眼睛/嘴换成 `<img className="pet-photo" ... />`。
- 修改 `src/renderer/src/styles.css`：`.pet-illustration` 尺寸改为 120×148（竖图），新增 `.pet-photo`（object-fit: cover，圆角 18px）。

### 验证结果
- `npm run typecheck` ✅（.jpg 导入由 vite/client 类型覆盖，没报错）。
- dev 服务器热更新成功（page reload + hmr update，无报错）。
- 窗口效果需要用户亲眼确认（本会话看不到图片）。

### 注意 / 待办
- 旧的 CSS 青蛙样式（`.pet-ear`/`.pet-face`/`.pet-eye`/`.pet-mouth` 等）还留在 styles.css 里，现在没人用了，后续可以清理。
- 照片是竖图 1079×1334，目前按 120×148 用 `object-fit: cover` 显示，基本按原比例，几乎不裁切。
  如果用户想放大/圆形头像/只显示一部分，再调。
- [ ] 确认照片显示效果是否满意（是否要放大、改圆角、去背景等）

---

## 模板（下次照抄）

### 2026-xx-xx — 标题
- 背景：
- 改了哪些文件：
- 验证结果（实际跑过什么、结果如何）：
- 待办 / 下一步：
