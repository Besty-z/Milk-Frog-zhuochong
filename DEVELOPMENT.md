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

## 2026-10-13 — 明确最终形态与路线图（规划，未改代码）

### 用户澄清的最终目标
成品不是给自己用的玩具，而是给别人用：**用户导入任意图片 → 自动抠出人物 → 成为桌宠**。

### 技术选型（自动抠图）
- 首选 `@imgly/background-removal`：在 Electron 应用内本地运行（ONNX/WASM），
  首次下载一个小模型后离线可用，无 API 费用、隐私好。是桌面应用自动抠图的主流方案。
- 备选：云端 API（remove.bg 等）——效果可能更好，但需联网 + API key + 费用 + 图片上传第三方（隐私问题）。
- 结论：先按本地方案设计 AssetManager。

### 影响
- "透明 PNG" 不再是前置条件：最终靠自动抠图生成透明 PNG，现在用 JPG 当占位即可。
- 自动抠图功能放到显示系统搭好之后（Phase B）。

### 关于窗口尺寸的澄清（重要）
- **不是"图片铺满窗口"**，而是：抠图后扫描非透明像素，算出人物的**包围盒（bounding box）**，
  窗口尺寸 = 这个包围盒的尺寸（可留少量边距），交互也只作用在人物范围内。
- 人物内部仍可能有透明空隙（两腿间、手臂与身体间），这些空隙仍需 alpha 检测穿透。

### 模块架构（含动作模块）
- **AssetManager**（主进程）：导入图片 → 自动抠图 → 算人物包围盒 → 缓存。产出透明 PNG + 包围盒尺寸。
- **PetWindow**（主进程）：透明无边框窗口、尺寸跟随包围盒、点击穿透、托盘、位置保存。
- **PetInteraction**（渲染进程）：鼠标事件、alpha 像素检测（透明穿透/人物响应）、区分点击 vs 拖动。
- **ActionModule 动作模块**（渲染进程）：动作状态机（待机/开心/拖动/未来更多），定义每个动作的动画、时长、切换规则。
- **PetRenderer**（渲染进程）：按 ActionModule 当前动作，把角色画出来并播放动画。
- 流程：点击角色 → PetInteraction 判定点击 → ActionModule 切"开心" → PetRenderer 播开心动画。
- 流程：拖动 → PetInteraction 判定拖动 → PetWindow 移窗口 + ActionModule 切"拖动"。

### 路线图（更新）
- Phase A（现在）：显示系统改造 —— Step1 删 UI / Step2 尺寸=包围盒 / Step3 点击穿透 / Step4 交互(点击vs拖动) / Step5 拆成上面 5 个模块（含动作模块）
- Phase B：导入图片 + 自动抠图（AssetManager，接 `@imgly/background-removal`）
- Phase C：状态气泡 + 动作模块扩展更多动作
- Phase D：AI 聊天
- Phase E：多角色、Android

---

## 2026-10-13 — Phase A · Step 1 完成：删掉所有 UI

### 做了什么
- `src/renderer/src/App.tsx`：精简成只渲染一张 `<img>`（角色图），删掉卡片、−× 按钮、
  名字/状态/运行信息/拖动提示等全部文字，以及平台信息相关的 state/effect。
- `src/renderer/src/styles.css`：整体重写为最简——只剩透明基底 + `.pet-stage`（拖拽区）+ `.pet-photo`（图片铺满）。
  一并清掉了之前遗留的 CSS 青蛙（`.pet-ear`/`.pet-face`/`.pet-eye`/`.pet-mouth`）、卡片、按钮、文字样式。

### 当前效果
- 窗口里只有角色图片，没有卡片、文字、按钮。
- 图片用 `object-fit: contain` 铺满窗口（不变形，边缘有极小的透明留白）。
- 整块仍是 `-webkit-app-region: drag`，所以窗口还能拖动；隐藏/退出改由系统托盘菜单操作。

### 暂时移除（后续步骤会回来）
- 点击=开心、拖动=开心/拖动态：这些交互在 Step 4 用 ActionModule 重新实现。

### 验证
- `npm run typecheck` ✅；dev 热更新成功（page reload + hmr，无报错）。
- 待用户屏幕确认"只剩角色、无 UI"。

### 下一步
- Step 2：窗口尺寸 = 人物包围盒（去掉主进程 280×340 写死）。

---

## 2026-10-13 — Phase A · Step 2 完成：窗口尺寸 = 角色尺寸

### 做了什么
- `App.tsx`：渲染层加载图片后，按目标宽度 150px 等比例算出高度，通过 IPC `pet:set-size` 告诉主进程。
- `preload/index.ts` + `vite-env.d.ts`：新增 `setSize(width, height)` 桥接方法。
- `main/index.ts`：删掉写死的 280×340（含 min/max），新增 `pet:set-size` IPC，收到后 `mainWindow.setSize()`。
- `styles.css`：图片恢复铺满窗口（100%×100% + object-fit: contain），去掉临时 150px 宽度。

### 效果
- 窗口自动变成 150×185（等比例），刚好包住角色，没有多余透明边距。

### 遇到的问题（重要，以后会再遇到）
- 改主进程/preload 后，electron-vite dev **不会自动重启 electron**，需要手动重启 dev。
- 手动重启时旧实例没被杀干净（TaskStop 只杀了 npm 壳，electron 子进程成孤儿），
  导致：两个窗口 + 端口 5173 被占 + 新实例报 "cache 拒绝访问"。
- 处理：精确停掉旧的 4 个 electron 进程（PID 20192/39496/47852/51796）。
  cache 报错是两实例抢缓存目录导致，非持久 bug，单实例不会出现。
- 遗留：旧 vite node 进程（PID 32100/44840）仍占 5173 端口，无害，后续可清理。

### 验证
- `npm run typecheck` ✅；新实例正常启动（setSize 无报错）。
- 待用户屏幕确认窗口缩成 150×185。

### 下一步
- Step 3：点击穿透（透明区域穿透 / 角色区域响应）。

---

## 2026-10-13 — Phase A · Step 3+4 完成：手动拖动 + 点击开心 + 点击穿透机制

### 背景
Step 3（点击穿透）和 Step 4（点击 vs 拖动）其实是同一件事：都要把原来整块
`-webkit-app-region: drag` 换成手动鼠标处理。而且 Step 3 的可见效果（透明区域穿透）
用现在的 JPG 看不到——JPG 不透明，没有透明区域可穿，要等 Phase B 换透明 PNG 才显现。
所以两步合起来做。

### 改了哪些文件
- `App.tsx`：删掉 app-region 依赖，改为手动处理鼠标——
  - `onPointerDown/Move/Up` + `setPointerCapture`：区分「点击」和「拖动」（移动 > 4px 算拖动）。
  - 点击 → `triggerHappy()`（给图片加 `.pet-photo--happy` 类，跳两下动画，1.6s 后复原）。
  - 拖动 → 调 `dragStart/dragMove/dragEnd`，真正移动窗口交给主进程算。
  - 建一张离屏 canvas 缓存图片，`updateIgnoreMouse()` 读光标下像素 alpha：透明就 `setIgnoreMouse(true)` 穿透。
    （现在 JPG 全不透明，恒为 false，机制先就位，Phase B 换透明 PNG 自动生效。）
- `main/index.ts`：引入 `screen`；新增 4 个 IPC：
  - `pet:drag-start` 记录窗口位置 + 当前光标位置；`pet:drag-move` 用 `screen.getCursorScreenPoint()`
    差值 + `setPosition()` 移窗口；`pet:drag-end` 清空记录。
  - `pet:set-ignore-mouse` → `mainWindow.setIgnoreMouseEvents(ignore, { forward: true })`。
- `preload/index.ts` + `vite-env.d.ts`：新增 `dragStart/dragMove/dragEnd/setIgnoreMouse` 桥接。
- `styles.css`：删掉 `.pet-stage` 的 `-webkit-app-region: drag`；新增 `cursor: grab/grabbing`、
  `.pet-photo--happy` 和 `@keyframes pet-hop`；图片加 `pointer-events: none`（事件统一落在 stage 上）。

### 关键点（教学）
- `-webkit-app-region: drag` 会把整块区域变成系统拖拽区，**吞掉点击事件**，无法区分点击和拖动，
  所以手动交互必须去掉它。
- `setPointerCapture`：按下后把指针"锁"给该元素，鼠标移出窗口也能继续收到 move/up，
  拖动才不会一快就断。
- `setIgnoreMouseEvents(true, { forward: true })`：`forward: true` 让渲染层在"穿透模式"下仍收到
  mousemove，这样光标从透明区滑到角色上时能及时取消穿透、恢复响应。
- 拖动位置用主进程 `screen.getCursorScreenPoint()` 算，渲染层只发「开始/移动/结束」信号，坐标不来回传。

### 验证
- `npm run typecheck` ✅。
- 改了主进程/preload，electron-vite dev 需重启 electron 才生效（窗口若没变化，手动重启 `npm run dev`）。
- 待用户屏幕确认：点击角色跳两下、按住拖动可移动、窗口仍贴住角色。

### 下一步
- Step 5：拆模块（PetWindow / PetRenderer / PetInteraction / ActionModule / AssetManager）。

---

## 2026-10-13 — 补：托盘加「回到屏幕内」菜单

### 背景
用户反馈：拖动时角色会出现「放大」现象；且窗口拖出屏幕后找不回来（`skipTaskbar` 没有任务栏按钮，
托盘「显示桌宠」只重新 show、不重置位置，重启还会恢复保存的屏幕外位置，形成死循环）。

### 做了什么
- `main/index.ts`：新增 `centerPetWindow()`——把窗口移到主屏工作区（`workArea`）中心，并 show + focus。
- 托盘菜单在「隐藏桌宠」后加一项「回到屏幕内」，点击调 `centerPetWindow()`。

### 关于「拖动时放大」
- 用户决定先把它当作动作模块里「拖动」动作的一种表现，Step 5 做 ActionModule 时再处理
  （届时决定：是保留成有意的动画，还是修掉）。
- 可能的技术根因待查：怀疑与 Windows DPI 缩放下拖动坐标换算有关
  （`screen.getCursorScreenPoint()` 与 `getPosition()` 单位/坐标系是否一致）。暂未处理。

### 验证
- `npm run typecheck` ✅。
- 改了主进程，需重启 `npm run dev` 才生效；待用户点托盘「回到屏幕内」确认窗口回主屏中心。

### 下一步
- Step 5：拆模块（含 ActionModule，顺带处理「拖动放大」是保留还是修复）。

---

## 2026-10-13 — Phase A · Step 5（1/3）：主进程拆出 PetWindow

### 做了什么
- 新增 `src/main/PetWindow.ts`：把窗口相关逻辑全部搬过来——窗口创建、尺寸、位置保存/恢复、
  拖动移窗、点击穿透、系统托盘、「回到屏幕内」，以及窗口相关 IPC
  （hide / show / close / set-size / drag-start / drag-move / drag-end / set-ignore-mouse）。
- 瘦身 `src/main/index.ts`：只留 app 级设置（GPU 开关、cache 路径）、`get-system-info` IPC、
  和 app 生命周期（whenReady / activate / before-quit / window-all-closed）。
- PetWindow 对外只暴露 3 个函数：`initPetWindow()`、`ensurePetWindow()`、`saveWindowPositionOnQuit()`。

### 为什么（教学）
- 职责分离：`index.ts` 只管「应用启动/退出」，窗口的一切细节归 PetWindow。以后加窗口特性不用再碰入口文件。
- 主进程多文件：electron-vite 会把 `index.ts` 和它 import 的 `PetWindow.ts` 一起打包成单个
  `out/main/index.js`（构建日志「2 modules transformed」），所以 `PetWindow.ts` 里的 `__dirname`
  仍然指向 `out/main/`，`../preload`、`../renderer`、`../../resources` 这些相对路径都不变。

### 验证
- `npm run typecheck` ✅。
- `npm run build` ✅（主进程 bundle 成 out/main/index.js，6.03kB）。
- 纯搬家、行为无变化，但改了主进程，需重启 `npm run dev` 确认窗口 / 托盘 / 拖动 / 回到屏幕内都正常。

### 下一步
- Step 5（2/3）：渲染进程拆 ActionModule（动作状态机 idle / happy / drag）。

---

## 2026-10-13 — Phase A · Step 5（2/3）：渲染进程拆 ActionModule

### 做了什么
- 新增 `src/renderer/src/modules/ActionModule.ts`：动作状态机 `usePetAction()`。
  - `PetAction = 'idle' | 'happy' | 'drag'`。
  - `ACTION_DURATION` 表定义每个动作时长：happy = 1600ms；drag 没写时长 → 一直持续直到 `stop()`。
  - 返回 `{ action, play, stop }`；`play('happy')` 到点自动回 idle。
- `App.tsx`：删掉 isHappy state / happyTimer / triggerHappy，改用 `usePetAction()`。
  点击 → `play('happy')`，开始拖动 → `play('drag')`，拖动结束 → `stop()`。

### 为什么（教学）
- 动作状态机：把「桌宠正在做什么」抽成一个独立状态，渲染层只按状态画。
  以后加动作（睡觉/说话）只需加枚举 + 时长 + 动画类，不用再动交互逻辑。

### 验证
- `npm run typecheck` ✅。

---

## 2026-10-13 — Phase A · Step 5（3/3）：拆 PetInteraction / PetRenderer / AssetManager

### 做了什么
- 新增 `AssetManager.ts`：素材入口。`getPetImageUrl()`、`loadPetDisplaySize()`（算窗口尺寸）、
  `loadPetAlphaMap()`（透明像素图）。Phase B 在这里加「导入 → 抠图 → 包围盒」。
- 新增 `PetInteraction.ts`：`usePetInteraction()` 处理鼠标——点击/拖动判定 + 点击穿透（alpha 检测），
  结果通过 onTap / onDragStart / onDragMove / onDragEnd 回调交给上层。
- 新增 `PetRenderer.tsx`：`PetRenderer` 按动作渲染 `<img>`，动作 → CSS 类映射放在 `ACTION_CLASS`。
- `App.tsx` 瘦身到约 60 行，只做「组装」。

### 验证
- `npm run typecheck` ✅。
- `npm run build` ✅（渲染进程 33 个模块，4 个新模块都打进 bundle）。

### Step 5 整体完成，最终结构
- 主进程：`index.ts`（入口）+ `PetWindow.ts`。
- 渲染进程：`App.tsx`（组装）+ `modules/{AssetManager, ActionModule, PetInteraction, PetRenderer}`。
- 行为不变，纯拆分。

### 下一步
- 重启 `npm run dev` 确认整体没坏（这次主进程 + 渲染进程都动了）。
- Phase B：导入图片 + 自动抠图（AssetManager 接 `@imgly/background-removal` + 算包围盒）。

---

## 2026-10-14 — Phase B · Step 1：首页窗口 + 导入图片打通

### 背景
用户要在托盘「回到屏幕内」旁边加一项「打开首页」——弹出第二个窗口（桌宠项目的首页/控制台），
里面分三个并列模块：导入（加新图）、动作（触发动作）、桌宠样式（管理导入过的图片库）。
本次先打通「首页窗口 + 导入页」，动作页和样式页先占位。

### 改了哪些文件
- 新增 `src/main/HomeWindow.ts`：普通带边框的首页窗口（480×640，非透明、非置顶、有任务栏按钮）。
  和桌宠共用同一个渲染页面，用 `?view=home` 区分。
- 新增 `src/main/PetAssets.ts`：图片导入 + 持久化 + 通知换图。
  - `pet:choose-image`：弹系统文件框（jpg/jpeg/png/webp/gif），把图读成 data URL 返回。
  - `pet:apply-image`：保存当前图到 `userData/current-pet.json`，并 `sendToPet('pet:image-changed', ...)`。
  - `pet:get-current-image`：启动时首页/桌宠向主进程要当前图。
- 改 `src/main/PetWindow.ts`：托盘菜单加「打开首页」（紧挨「回到屏幕内」）；新增导出 `sendToPet()`。
- 改 `src/main/index.ts`：启动时 `initPetAssets()`。
- 改 `src/preload/index.ts` + `vite-env.d.ts`：加 `chooseImage / applyImage / getCurrentImage / onPetImageChanged` 四个桥接。
- 新增 `src/renderer/src/HomeApp.tsx` + `home.css`：首页，三个标签页（导入/动作/桌宠样式），导入页可用。
- 改 `src/renderer/src/main.tsx`：按 `?view=home` 渲染 HomeApp 还是 App；首页时给 `<html>` 加 `.home-page` 类。
- 改 `src/renderer/src/modules/AssetManager.ts`：`getPetImageUrl` → `getDefaultPetImage`，
  `loadPetDisplaySize` / `loadPetAlphaMap` 改成接收 `imageUrl` 参数（不再写死 pet.jpg）。
- 改 `src/renderer/src/App.tsx`：加 `imageUrl` state；启动时 `getCurrentImage()` 换图、
  `onPetImageChanged` 跟随换图、图片变化时重新算窗口尺寸 + 重建 alpha 图。

### 关键点（教学）
- 两个窗口通信靠主进程中转：首页 `applyImage` → 主进程保存 + `webContents.send` → 桌宠窗口收到换图。
- 首页和桌宠共用同一个 HTML/bundle，用 URL 查询参数 `?view=home` 区分渲染哪个 React 组件；
  开发时 `loadURL(url + '?view=home')`，打包后 `loadFile(path, { query: { view: 'home' } })`。
- 共用 bundle 会让 CSS 串窗口：用 `document.documentElement.classList.add('home-page')`
  + `html.home-page ...` 前缀，保证首页样式不影响透明的小桌宠窗口。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅（主进程 out/main/index.js 9.25kB；渲染进程 35 个模块，含 HomeApp）
- 待用户 `npm run dev` 手动确认（改了主进程/preload，需重启 dev）：
  1. 托盘出现「打开首页」，点开出现首页窗口；
  2. 「导入」页点「选择图片」→ 选图 → 出现预览 → 点「设为桌宠」→ 小桌宠换成这张图；
  3. 重启 app 后，桌宠仍是导入的图（持久化生效）。

### 待办 / 下一步
- 动作页、桌宠样式页填内容（样式页 = 管理导入过的图片库）。
- 目前图片以 data URL 存进 `current-pet.json`，大图会占内存/体积，后续可改成「存图片文件 + 只存路径」。
- Phase B · Step 2：接 `@imgly/background-removal` 自动抠图。

---

## 2026-10-14 — Phase B · Step 1（续）：桌宠样式 = 图片库

### 背景
把「导入」从只存一张图，升级成存一个图片库；「桌宠样式」页做成图库，能来回切换/删除。

### 改了哪些文件
- 改 `src/main/PetAssets.ts`：单图 `current-pet.json` 换成图片库 `pet-library.json`（`{ images: [{id,name,dataUrl}], currentId }`）。
  - `pet:choose-image` 现在返回 `{ dataUrl, name }`（name 取原文件名）。
  - `pet:apply-image`：生成 id 后 push 进图库并设为当前 + 持久化 + 广播。
  - 新增 `pet:get-library`（返回整个图库）、`pet:select-image`（选当前，id 传 null 表示恢复默认）、
    `pet:delete-image`（删图；删的是当前图就自动切到剩下的第一张，没了就回默认）。
  - `pet:image-changed` 广播的负载改成 `string | null`（null = 用默认图）。
  - 加旧数据迁移：若只有旧的 `current-pet.json`，自动挪进新图库。
- 改 `src/preload/index.ts` + `vite-env.d.ts`：加 `getLibrary / selectImage / deleteImage`，
  `chooseImage` 返回类型改对象，`onPetImageChanged` 回调参数改 `string | null`。
- 改 `src/renderer/src/HomeApp.tsx`：加 `library` state；「桌宠样式」页做成缩略图网格——
  点卡片切换、当前卡片绿框 + 「使用中」角标、导入图可删除（stopPropagation 防止误触切换）、
  顶部有「默认桌宠」卡片可切回默认。
- 改 `src/renderer/src/App.tsx`：`onPetImageChanged` 收到 null 时回退 `getDefaultPetImage()`。
- 改 `src/renderer/src/home.css`：加 `.home-grid / .home-card / .home-card--current / .home-card-badge / .home-card-delete` 样式。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅（主进程 out/main/index.js 11.43kB）
- 待用户 `npm run dev` 手动确认（改了主进程/preload，需重启 dev）：
  1. 导入多张图后，「桌宠样式」页出现这些图的缩略图；
  2. 点不同卡片，小桌宠跟着切换；点「默认桌宠」切回占位图；
  3. 删一张图：若是当前图会自动切走；重启后图库还在。

### 待办 / 下一步
- 动作页：预览/触发桌宠动作（待机 / 开心 / 拖动…）。
- 图片库目前每张图以 data URL 存进 `pet-library.json`，图多/图大时文件会很大，
  后续改成「图片存成文件、json 只存路径」。
- Phase B · Step 2：接 `@imgly/background-removal` 自动抠图。

---

## 2026-10-14 — Phase B · Step 1（再续）：动作页打通，首页三页齐了

### 背景
首页最后一个空标签「动作」页：在首页点「预览」，桌面上的桌宠当场做对应动作。

### 改了哪些文件
- 改 `src/main/PetWindow.ts`：`registerIpcHandlers` 加 `pet:trigger-action`——
  收到后 `sendToPet('pet:trigger-action', action)` 转发给桌宠窗口。
- 改 `src/preload/index.ts` + `vite-env.d.ts`：加 `triggerAction(action)` 和 `onTriggerAction(cb)`。
- 改 `src/renderer/src/App.tsx`：订阅 `onTriggerAction`，`happy` → `play('happy')`、`idle` → `stop()`。
- 改 `src/renderer/src/HomeApp.tsx`：动作页列出动作卡片（待机 / 开心），点「预览」调 `triggerAction`。
- 改 `src/renderer/src/home.css`：加 `.home-action-list / .home-action-item` 等样式。

### 关键点（教学）
- 触发动作也走「首页 → 主进程 → 桌宠窗口」这条中转，和换图一个套路。
- 现在可预览的动作只有 idle/happy（drag 是拖动时进入的状态，不适合做成按钮）。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅（主进程 11.59kB、preload 2.04kB）
- 待用户 `npm run dev` 确认：首页「动作」页点「开心」→ 桌宠跳两下；点「待机」→ 停下。

### 首页三个标签页现状
- 导入：选图 → 导入并设为桌宠 ✅
- 桌宠样式：图片库，切换 / 删除 / 恢复默认 ✅
- 动作：预览 待机 / 开心 ✅

### 待办 / 下一步
- Phase B · Step 2：接 `@imgly/background-removal` 自动抠图（导入 → 抠出人物 → 算包围盒 → 透明 PNG）。
- 图片库目前 data URL 直接存 json，图多会很大，后续改成「图片存文件、json 存路径」。

---

## 2026-10-14 — 修「拖动时放大」+ 桌宠样式缩略图裁切

### 背景
1. 用户反馈桌宠样式页缩略图怪：竖图被 `object-fit: cover` + 固定 120px 高裁成横条。
2. 用户要修「拖动时桌宠变大」（开发记录里早就标记的已知问题）。

### 改了哪些文件
- `src/renderer/src/home.css`：缩略图改成「正方形 `aspect-ratio: 1/1` + `object-fit: contain`」，整图显示不裁切。
- 拖动坐标换算改造（去掉 `screen.getCursorScreenPoint()`，改由渲染层传屏幕坐标）：
  - `src/renderer/src/modules/PetInteraction.ts`：按下时记录 `event.screenX/screenY`，
    `onDragStart/onDragMove` 回调带上屏幕坐标。
  - `src/renderer/src/App.tsx`：`dragStart(screenX, screenY)` / `dragMove(screenX, screenY)`。
  - `src/preload/index.ts` + `vite-env.d.ts`：`dragStart/dragMove` 改为接收屏幕坐标。
  - `src/main/PetWindow.ts`：`pet:drag-start` / `pet:drag-move` 用渲染层传来的坐标做差值，
    不再读全局光标。

### 为什么（教学）
- 「拖动放大」疑似 Windows DPI 缩放下，主进程 `screen.getCursorScreenPoint()` 的坐标和
  `getPosition()/setPosition()` 不在同一套坐标系，差值换算错位。
- 改成用鼠标事件的 `screenX/screenY`（和窗口同一套 DIP 坐标）后，起点、终点、窗口位置三者对齐。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅
- 待用户 `npm run dev` 确认：拖动桌宠不再变大/乱跳。
- 若还变大，下一步怀疑「透明窗口 + 禁用 GPU 软件渲染」的合成瑕疵，可尝试去掉 index.ts 里三行
  `disable-gpu / disable-gpu-compositing / disableHardwareAcceleration`（透明窗口需重测透明效果）。

### 待办 / 下一步
- 若拖动仍有问题：试 GPU 相关开关。
- Phase B · Step 2：接 `@imgly/background-removal` 自动抠图。

---

## 2026-10-14 — 拖动变大：去掉禁用 GPU 的三行（第二次尝试）

### 背景
坐标换算修完后用户反馈拖动仍「自己变大」。按开发记录里第二个嫌疑排查：软件渲染。

### 做了什么
- `src/main/index.ts`：删掉 `disable-gpu` / `disable-gpu-compositing` / `disableHardwareAcceleration()` 三行
  （三者重复，作用都是禁用硬件加速、改用软件渲染）。
- 影响：应用恢复默认 GPU 渲染。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅
- 待用户确认两件事：
  1. 拖动桌宠不再变大；
  2. 透明窗口仍然正常（桌宠显示在桌面、没有黑底/白底方块）。若出现黑底，需回退此改动另想办法。

### 待办
- 若仍变大，下一条线索：显式设置 DPI 感知，或改用原生拖动（WM_NCLBUTTONDOWN / app-region）。
- Phase B · Step 2：自动抠图。

---

## 2026-10-14 — 拖动变大：真正的根因和修复（setPosition → setBounds）

### 背景
坐标换算、GPU 两次尝试都没解决「拖动时自己变大」。查证后确认是 Electron 已知问题：
**Windows 显示缩放 ≠ 100% 时，对无边框透明窗口反复调用 `setPosition()` 会越拖越大**。

### 真正根因
`setPosition(x, y)` 不带尺寸，在非 100% 缩放下位置和尺寸被混算，导致窗口尺寸被逐渐放大。

### 修复
- `src/main/PetWindow.ts`：
  - 拖动改 `setBounds({ x, y, width, height })`，并在 drag-start 记录 `dragStartSize`，
    每次 move 都把尺寸钉回原值。
  - `centerPetWindow()` 的 `setPosition` 也改成 `setBounds`（带上已读取的宽高）。
- `src/main/index.ts`：还原上一步误删的三行 GPU 开关（那不是根因，保持改动干净）。

### 关键结论（教训）
- 坐标源（screenX/screenY vs getCursorScreenPoint）和 GPU 都不是根因，是 `setPosition` 这个 API 本身。
- 以后凡是移动无边框透明窗口，都用 `setBounds` 显式带尺寸，别用 `setPosition`。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅
- 待用户确认：拖动不再变大。

### 待办
- Phase B · Step 2：自动抠图。

---

## 模板（下次照抄）

### 2026-xx-xx — 标题
- 背景：
- 改了哪些文件：
- 验证结果（实际跑过什么、结果如何）：
- 待办 / 下一步：
