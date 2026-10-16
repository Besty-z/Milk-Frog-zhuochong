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

## 2026-10-14 — Phase B Step 2：接入自动抠图（@imgly/background-removal）

### 背景
项目愿景是「导入任意图片 → 自动抠出人物 → 成为桌宠」。依赖 `@imgly/background-removal@1.7.0`
（peer 依赖 `onnxruntime-web@1.21.0`）已装好。这一步先跑通最小抠图，接进导入流程。

### 做了什么
- 新增 `src/renderer/src/modules/BackgroundRemoval.ts`：`cutoutImage(imageSrc, onProgress)`。
  - 用**动态 import** 加载库，只有点「抠图」时才加载 onnxruntime + wasm（约 490KB JS + 23MB wasm），
    桌宠小窗口平时的 bundle 不背这个包袱。
  - `device:'cpu'`（主进程关了 GPU）；返回透明 PNG 的 dataURL。
- 改 `src/renderer/src/HomeApp.tsx`：导入预览页新增「一键抠图并设为桌宠」主按钮 + 「不抠图直接导入原图」兜底按钮；
  抠图时显示下载/处理进度（`cutoutMsg`），失败弹窗提示。
- 改 `src/renderer/src/home.css`：加 `.home-progress` 进度文字样式。

### 一个踩坑（很重要）
- `@imgly/background-removal@1.7.0` 的 README 写的是 `import removeBackground from '...'`（默认导入），
  但实际产物 `dist/index.mjs` 和 `dist/index.cjs` **只有具名导出、没有默认导出**（`export { removeBackground, ... }`），
  类型文件 `index.d.ts` 也只 `export * from './api/v1'`（`export *` 不会转发 default）。
  → 必须用**具名导入** `const { removeBackground } = await import(...)`，否则默认导入拿到 `undefined`。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅（确认 vite 把 onnxruntime/wasm 拆成独立 chunk，主 bundle 仍是 162KB）
- 待用户 `npm run dev` 验证真正的抠图效果。**注意：第一次抠图要联网从 IMG.LY CDN 下载模型
  （默认 isnet_fp16 约 80MB），之后会缓存。**

### 待办 / 下一步
- 用户验证抠图效果；若太慢可换小模型 `model:'isnet_quint8'`（约 40MB）。
- Phase B · Step 3：抠图后算人物包围盒，把窗口尺寸设为包围盒，透明区域才能点穿。
- 图片存 dataURL 在 JSON 里，未来改存文件。

---

## 2026-10-14 — 默认桌宠也自动抠图（开箱即透明）

### 背景
默认桌宠是打包在应用里的 `assets/pet.jpg`（带背景、不透明）。用户希望它也和导入图一样是透明底的。
但它是固定素材、无法在代码里预生成透明 PNG，所以改成「首次启动后台抠一次 → 缓存 → 以后直接用」。

### 做了什么
- `src/main/PetAssets.ts`：新增默认图抠图缓存，存 `userData/default-pet-cutout.json`。
  新增 IPC `pet:get-default-cutout`（读缓存）、`pet:save-default-cutout`（写缓存）。
- `src/preload/index.ts` + `src/renderer/src/vite-env.d.ts`：加 `getDefaultCutout()` / `saveDefaultCutout()`。
- `src/renderer/src/App.tsx`（桌宠窗口）：
  - 把「当前图」和「默认图」拆成两个 state，`imageUrl = currentImage ?? defaultImage`。
  - 启动时读默认图抠图缓存；没有就后台 `cutoutImage(默认图)`，成功后缓存 + 换成透明版；失败（没网）保持原图、下次再试。
- `src/renderer/src/HomeApp.tsx`：桌宠样式页的「默认桌宠」缩略图也读缓存，显示透明版。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅
- 待用户 `npm run dev` 验证：第一次启动桌宠会短暂显示带背景的原图，抠完后自动变成透明底；
  之后启动直接透明。（第一次抠默认图同样要联网下载模型，和导入抠图共用浏览器缓存，只下一次。）

### 待办
- Phase B · Step 3：抠图后算人物包围盒，窗口尺寸缩到人物范围，透明区才能点穿。

---

## 2026-10-14 — 抠图失败根因：CDN wasm 分片 404 → 改为本地自托管

### 背景
默认桌宠/导入抠图都报错 `Invalid format: text/html`。排查后确认不是代码问题，是 IMG.LY 的 CDN
上 `ort-wasm-simd-threaded.wasm` 的第 1 个分片返回 404（返回的是 HTML 错误页），onnxruntime 把 HTML
当 wasm 解析就报这个错。另外还发现一个隐患：node_modules 装的是稳定版 `onnxruntime-web@1.21.0`，
和这个库 README 推荐/测试的 `1.21.0-dev.20250206-d981b153d3` 不一致（wasm 大小都对不上）。

### 做了什么（改成自托管，彻底摆脱 CDN）
1. `npm install onnxruntime-web@1.21.0-dev.20250206-d981b153d3`（README 推荐的版本，装上后
   本地 wasm/mjs 大小和 CDN 完全一致：11819815 / 25539）。
2. 新增脚本 `scripts/download-bg-model.mjs`：从 CDN 下载 `isnet_fp16` 模型 22 个分片，拼成
   `src/renderer/public/bg-removal/isnet_fp16.onnx`（88MB，一次即可）。
3. 新增脚本 `scripts/setup-bg-removal.mjs`：把 onnxruntime 的 wasm/mjs 复制进
   `src/renderer/public/bg-removal/`，并生成 `resources.json`（单分片、精确大小 + mime）。
4. `src/renderer/src/modules/BackgroundRemoval.ts`：加 `publicPath` 指向本地 `bg-removal/`
   （dev 由 Vite 伺服，打包后跟着 index.html 相对路径）。
5. `.gitignore`：忽略 `src/renderer/public/bg-removal/`（100MB 二进制不进 git，靠脚本再生成）。
6. 顺带：`src/main/index.ts` 加 `--enable-features=SharedArrayBuffer`；渲染层抠图失败会写
   `userData/error.log`（`pet:log-error`）方便排查。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅（确认 `out/renderer/bg-removal/` 里模型/wasm/mjs 都在）
- 待用户 `npm run dev` 实测抠图是否成功（这次不联网下载模型，应该快很多且稳定）。

### 待办
- 用户实测抠图成功后可删掉临时弹窗 `window.alert`（保留 error.log 即可）。
- 打包（file://）时本地资源用相对 URL 加载是否 OK 待验证，必要时改用自定义协议。
- 若抠图太慢可换 `isnet_quint8`（44MB，需重新跑下载脚本，把 KEY 改成 /models/isnet_quint8）。

---

## 2026-10-14 — 首页窗口/任务栏图标换成默认桌宠（小青蛙）

### 背景
用户要「首页打开后的图标换成默认桌宠的样子」。之前首页窗口没设 `icon`，Windows 任务栏/标题栏
显示的是 Electron 默认图标；桌宠窗口无边框且 `skipTaskbar`，只有 Alt+Tab 切窗列表会用到图标。

### 做了什么
- 新增脚本 `scripts/make-icon.ps1`：用 Windows 自带的 System.Drawing 把
  `src/renderer/src/assets/pet.jpg` 居中裁成正方形、缩到 256x256，输出 `resources/icon.png`。
  （项目没装 sharp/jimp 等 Node 图片库，直接用 PowerShell 最省事，Windows-only 够用。）
- 生成 `resources/icon.png`（256x256，约 67KB）。
- `src/main/HomeWindow.ts`：`BrowserWindow` 加 `icon: nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))`。
- `src/main/PetWindow.ts`：同样加上 `icon`（Alt+Tab 切窗列表里也显示成小青蛙，保持一致）。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅
- 待用户 `npm run dev` 确认：打开首页后任务栏/标题栏图标是否变成小青蛙。
  （注意：Electron 有时会缓存旧图标，若没变可重启程序或清一下系统图标缓存。）

### 待办
- 首页图标现在是「带背景的方形照片裁剪」，以后如果想更精致，可在抠图缓存生效后
  用透明版抠图结果重新生成一次 `icon.png`（做成真正透明背景的青蛙）。

---

## 2026-10-14 — Phase B · Step 3：抠图后按人物包围盒收紧窗口

### 背景
抠图已经能出透明 PNG，但窗口尺寸还是按「整张原图」的比例定的。结果人物只占画面中间
一小块，四周一大圈看不见的透明矩形；透明区越大越容易误挡下面窗口，也不「贴」。这一步
把窗口收到人物实际占的矩形（非透明像素的包围盒），图也跟着裁到只显示人物。

### 做了什么
- `src/renderer/src/modules/AssetManager.ts`：
  - 删掉旧的 `loadPetDisplaySize` / `loadPetAlphaMap`，合并成一个 `loadPetSprite()`。
  - 新增 `computeBounds()`：扫整张图找 `alpha > 0` 的最小/最大 x、y（全图不透明时结果=整图，
    全透明时退回整图防除零）。
  - `loadPetSprite()`：画进离屏画布 → 算包围盒 → 裁出包围盒区域 → 返回
    `{ dataUrl（裁好的 PNG）, width/height（按包围盒比例 × 目标宽 150）, alphaCanvas（裁好的图，复用给点击穿透） }`。
- `src/renderer/src/App.tsx`：
  - 加 `spriteUrl` state，图片变了先 `setSpriteUrl(null)` 回落显示原图，再异步裁好换上；
  - 用 `loadPetSprite` 的返回值同时干三件事：`setSpriteUrl`（显示裁好的图）、
    `alphaCanvasRef.current`（点击穿透判定）、`setSize`（窗口收紧到包围盒比例）。
  - 渲染 `PetRenderer imageUrl={spriteUrl ?? imageUrl}`。
- 样式不用改：裁好的图宽高比 == 窗口比例，`object-fit: contain` 正好铺满，动画照常。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅
- 待用户 `npm run dev` 实测：导入一张图（或等默认桌宠抠图完成）后，窗口是否自动收到人物范围、
  青蛙是否变大变贴、点击透明边缘是否能穿透到下面窗口。

### 待办
- Phase B 基本完成，可进入下一阶段：打包成安装包（electron-builder）、或加更多动作/动画。
- 大图抠图+包围盒扫描是一次性的，暂时没做降采样优化；如果以后图特别大卡顿再优化。
- 临时弹窗 `window.alert`（抠图失败用）等抠图稳定后删掉，保留 error.log。

---

## 2026-10-14 — 动图桌宠 + 动作系统（GIF）

### 背景
用户想把桌宠从「静态图 + CSS 动画」升级成「动图」：导入 GIF 桌宠就动起来，能自动识别/拆分
动作，还能自己创建动作（框一段帧起名字），并且**预览能直接在首页看到**。已确认：先做 GIF
（视频后补）；背景「透明优先，带背景的整帧先显示、逐帧抠图后补」。「自动识别动作」落地成
「整段循环 = 待机 + 手动框帧创建动作」（真正的语义 AI 识别没必要）。

### 做了什么
- 新增依赖 `gifuct-js`（纯 JS 解 GIF，自带类型）。
- 新增 `src/renderer/src/modules/GifDecoder.ts`：`decodeGif(dataUrl)` —— 解帧 → 按 disposal
  规则合成完整帧 → 算所有帧「非透明像素并集包围盒」→ 逐帧裁到包围盒（透明 PNG dataURL）+
  生成点击穿透用的「并集 alpha 图」。桌宠窗口和首页预览共用。
- 新增 `src/renderer/src/modules/GifPlayer.tsx`：`<GifPlayer frames clip playing onClipEnd/>`，
  按每帧 delay 推进，clip 空=整段循环（待机），loop=false 播一次后回调 `onClipEnd`。
- 数据模型：库里条目加 `kind: 'image'|'gif'` 和 `actions`（存原始 GIF，不存帧）；「当前桌宠」
  从 `dataUrl|null` 升级成 `PetDescriptor|null`（`{kind:'image',dataUrl}` 或 `{kind:'gif',dataUrl,actions}`）。
- `src/main/PetAssets.ts`：加 `pet:apply-gif`（存原始 GIF + 空动作）、`pet:update-gif-actions`
  （编辑动作后持久化）；`pet:get-current-image`→`pet:get-current-pet`、`pet:image-changed`→`pet:current-changed`，负载改成 `PetDescriptor|null`。
- `src/preload/index.ts` + `vite-env.d.ts`：同步改 API（`applyGif/updateGifActions/getCurrentPet/onPetChanged`）+ 全局类型。
- `src/renderer/src/App.tsx`：`currentImage`→`currentPet`；GIF 时 `decodeGif` + `GifPlayer` 播放，
  动作触发切帧区间，非循环播完回到待机；静态图仍走 `loadPetSprite`。解码 effect 只依赖
  `gifDataUrl`（动作编辑广播不会触发重解帧）。
- `src/renderer/src/HomeApp.tsx` + `home.css`：导入页选到 GIF 显示动态预览 +「设为桌宠（动图）」；
  动作页当前是 GIF 时给「帧进度条 + 设起止帧 + 命名 + 循环开关」的动作编辑器，每个动作行放
  `GifPlayer` 小预览直接播效果；样式页给动图条目加「动图」角标。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅（gifuct-js 已进渲染层 bundle）
- 待用户 `npm run dev` 实测：
  1. 导入透明背景 GIF → 桌宠动起来、透明区仍可点穿；
  2. 动作页建动作（框帧 + 命名 + 循环）→ 主页动态预览正确、点「预览到桌宠」切到该动作；
  3. 带背景 GIF 整帧矩形显示；
  4. 重启后动图桌宠和动作定义还在。

### 待办
- 逐帧抠背景（把带背景 GIF 变透明，视频/复杂背景效果有限）。
- 视频（MP4）支持。
- 自动把 GIF 切分成多段（循环点/转场检测）作为「自动识别」的增强，现在先手动框帧。

---

## 2026-10-14 — GIF 逐帧抠背景（带背景动图也能变透明）

### 背景
用户问「为啥 gif 不去背景啊」——上一版 GIF 只是整帧矩形显示，带背景的动图没抠透明。
把「逐帧抠背景」从待办提进本期：导入 GIF 时一次性解码 +（可选）逐帧抠图 + 裁剪，把成品帧存进
图片库，运行时只播放、不再解码。

### 改动
- `GifDecoder.ts`：拆成 `decodeGifFrames`（解帧+合成完整帧）/ `cropGifFrames`（并集包围盒裁剪 +
  并集 alpha 图）/ `downscaleDataUrl` / `dataUrlToCanvas` / `framesWithDelays`。
- `BackgroundRemoval.ts`：新增 `cutoutFrames`（逐帧调 removeBackground，报进度）。
- 数据模型重构：动图条目从「存原始 GIF dataUrl」改成「存裁剪后的帧 + delays + width/height +
  alphaDataUrl + actions」；`PetDescriptor` 动图变体同步改，两种变体都加了 `id`（稳定 key）。
- `PetAssets.ts`：`pet:apply-gif` 接收成品帧；读库校验新字段（旧版存原始 GIF 的动图条目直接丢弃，
  主进程解不了帧）；抽 `makeStaticImage`/`isActionDef`。
- `preload` + `vite-env.d.ts`：`applyGif` 入参改成 `GifImportData`。
- `App.tsx`：动图不再运行时 `decodeGif`，用 `framesWithDelays` + `dataUrlToCanvas` 直接拼帧；
  用 `id` 做依赖，动作编辑广播不会重建帧。
- `HomeApp.tsx`：导入页选到 GIF 有「一键抠图并设为桌宠（逐帧抠，先缩到 320 提速）」和
  「不抠图直接导入」两个入口；动作页用存好的帧做进度条/预览；样式页动图用首帧做缩略图。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅。
- 待用户 `npm run dev` 实测：带背景 GIF 逐帧抠图 → 透明底动图；耗时与帧数成正比（CPU onnx）。

### 待办
- 逐帧抠图 CPU 较慢，后续可考虑 webgpu 或抽帧优化。
- 动作语义 AI 识别（现在先手动框帧）。
- 视频（MP4）支持。

---

## 2026-10-14 — 动作配音（每个动作都能带一个声音）

### 背景
用户「对了声音我也要」+ 想要「奶娃捧腹大笑」的魔性笑声。给动作系统加声音：每个动作可选一个
音频，触发动作时播放；音频可自己导入（mp3/wav/ogg/m4a），也内置了一个搜来的「奶龙大笑」音效。

### 改动
- `PetActionDef` 加可选 `soundDataUrl`（main 和 vite-env.d.ts 两处同步）。
- `PetAssets.ts`：新增 `pet:choose-audio`（选音频文件读成 dataURL，带 audio mime）。
- `preload` + `vite-env.d.ts`：加 `chooseAudio`。
- `HomeApp.tsx`：动作编辑器加「选声音 / 用内置大笑音效」，新建动作时把声音存进 `soundDataUrl`；
  动作列表项加「试听 / 删声音」。
- `App.tsx`：触发动图动作时 `new Audio(soundDataUrl).play()`（切换/待机会先停上一个），桌宠当场发声。
- 内置音效：`src/renderer/src/assets/laugh.mp3`（从鹏友锁车音效站抓的「奶龙笑声」5 秒预览 64kbps），
  通过 fetch→dataURL 存进动作，保证自包含、跨重启/重打包不失效。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅（laugh.mp3 进 bundle：out/renderer/assets/laugh-*.mp3）。
- 待用户 `npm run dev` 实测：新建动作配声音 → 预览到桌宠能听到；试听按钮能发声。

### 待办
- 「视频链接提取音频」：需要 yt-dlp + ffmpeg 下载/抽音，抖音/B站有反爬，属独立功能，后面单独做。
- 内置音效只是 5 秒预览，若要完整版需自己下载（鹏友锁车完整版要走验证码）。

---

## 2026-10-14 — 导入视频（MP4/WebM/MOV 当桌宠）

### 背景
用户「没法导入视频」。之前只支持图片/GIF，文件框把视频过滤掉了。加视频：导入后整段循环播放，
并带着视频自己的声音（正好覆盖「捧腹大笑视频 = 会动又会笑」的场景）。

### 改动
- `PetAssets.ts`：`mimeFromPath` 加 mp4/webm/mov；文件框过滤器加视频扩展；`PetImage`/`PetDescriptor`
  加 `kind:'video'`（存 dataUrl + width/height）；新增 `pet:apply-video`；读库校验视频条目。
- `vite-env.d.ts` + `preload`：加 `VideoImportData` 和 `applyVideo`。
- `HomeApp.tsx`：导入页选到视频用 `<video>` 预览 +「设为桌宠（视频）」（读 videoWidth/Height 后 apply）；
  样式页视频卡片用首帧缩略图 +「视频」角标；动作页对视频显示「暂不支持切动作」提示。
- `App.tsx`：视频渲染 `<video autoPlay loop playsInline>`（带声音）；窗口按最长边 260 等比缩放；
  视频没有透明通道，整块算可点（alpha 图填全不透明）。
- `home.css`：给 `.home-preview video` / `.home-card video` 补样式。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅。
- 待用户 `npm run dev` 实测：导入 mp4/webm → 桌宠循环播放 + 出声；矩形显示（MP4 无透明）。

### 待办
- 视频逐帧抠背景（很慢，暂不做）。
- 视频时间段动作（像 GIF 那样框时间起名）。
- 视频链接提取音频（yt-dlp + ffmpeg）。

---

## 2026-10-14 — 换默认桌宠为新照片

### 背景
用户往项目里放了一张新照片（根目录 `cc62a00fc82b56266cd0365e69bb1c18.jpg`，约 152KB），
要拿它替换原来的默认桌宠（旧奶蛙 `pet.jpg`）。

### 改了什么
- `src/renderer/src/assets/pet.jpg`：用新照片覆盖，默认桌宠直接换成这张。`AssetManager.getDefaultPetImage()`
  和图标脚本都不用改路径（都指向 `assets/pet.jpg`）。
- `src/main/PetAssets.ts`：默认图抠图缓存加版本号 `DEFAULT_CUTOUT_VERSION = 2`。原来的缓存
  `default-pet-cutout.json` 不校验版本，直接换图后旧透明图缓存仍会命中、显示旧青蛙；现在版本不符就
  返回 null、重新抠新图。以后换默认图记得把版本 +1。
- 重新生成图标：`resources/tray-16.png` / `tray-32.png`（`scripts/make-tray-icon.js`）、
  `resources/icon.png`（`scripts/make-icon.ps1`，去掉了 `-ExecutionPolicy Bypass`）。

### 验证结果（实际跑过）
- `npm run typecheck` ✅、`npm run build` ✅（新 pet.jpg 已打进 bundle：out/renderer/assets/pet-*.jpg 155.86kB）。
- 托盘图标、窗口图标已重生成。

### 待办 / 下一步
- 根目录那张 `cc62a00fc82b56266cd0365e69bb1c18.jpg` 已复制进 assets，根目录原件可删（留着也行）。
- 待用户 `npm run dev` 确认：桌宠窗口显示新照片；首次启动会自动重新抠新图（旧缓存已失效）。

---

## 2026-10-14 — 动作视频片段（本地文件，触发才播）

### 背景
用户要「导入桌宠动作视频」：一个动作 = 一段短视频，**触发才播**（不是「整段循环当桌宠」）。捧腹大笑
是奶娃专属动作，换别的桌宠要用那个桌宠自己的视频，不能硬套。已确认「视频链接」= 视频网站页面链接
（B站/抖音/YouTube，需 yt-dlp + ffmpeg）。本期只做阶段 1：本地文件建动作，先不碰链接。

### 改动
- `PetAssets.ts`：新增 `VideoActionDef { id, name, dataUrl, loop }`；`PetImage` 和 `PetDescriptor`
  的 image/gif/video 三种变体都带上 `videoActions`（动作按桌宠各自存，天然角色隔离）；读库/建条目时
  解析并默认 `videoActions: []`。默认奶娃不在图库里，它的动作单独存
  `userData/default-pet-video-actions.json`（`readDefaultVideoActions/saveDefaultVideoActions`，套
  抠图缓存同款套路）。新增 IPC：`pet:choose-video`、`pet:apply-video-action`、`pet:update-video-actions`、
  `pet:get-default-video-actions`，默认奶娃动作变化时 `sendToPet('pet:default-video-actions-changed', …)`。
- `vite-env.d.ts` + `preload/index.ts`：加 `VideoActionDef` 类型 + `chooseVideo/applyVideoAction/
  updateVideoActions/getDefaultVideoActions/onDefaultVideoActionsChanged` 桥接。
- `App.tsx`：加 `videoClip` / `defaultVideoActions` state；`renderBody` 最优先渲染
  `<video autoPlay playsInline loop? onEnded={回待机}>`；`onTriggerAction` 先按 id 在当前桌宠
  （或默认奶娃）的 videoActions 里找剪辑，找到就播、播完回待机，找不到再走原有 GIF 帧区间/静态 CSS 逻辑。
- `HomeApp.tsx`：动作页的「静态图/默认奶娃」分支新增「动作视频」编辑器——选本地视频、命名、是否循环、
  添加；列表每项缩略图 + 预览到桌宠 + 删除。GIF 仍保留原帧区间编辑器，视频桌宠仍提示暂不支持。
- `home.css`：加 `.home-subtitle`。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅。
- 待用户 `npm run dev` 实测：给默认奶娃加本地大笑视频动作 → 动作页「预览到桌宠」→ 桌宠播视频（带声）→
  播完回静态奶娃；换别的桌宠后动作页看不到奶娃的动作；重启后动作还在。

### 待办
- 阶段 2：视频链接导入（`yt-dlp-wrap` + `ffmpeg-static`，`pet:download-video` + 首页「从链接导入」）。
- 阶段 3（可选）：动作视频抠透明（RobustVideoMatting），去掉矩形背景。
- 奶娃大笑视频有版权，不自动打包，由用户自己导入。

---

## 2026-10-14 — 点击桌宠 → 捧腹大笑（带配音）

### 背景
用户真正想要的效果就是最简单的：点一下桌宠，播「捧腹大笑」动作并带声音。之前绕去调研「动作迁移」，
结论是对卡通脸不可靠、工程量也大，实际用不上。

### 改动
- `App.tsx`：新增 `triggerLaugh()`；`usePetInteraction` 的 `onTap` 从 `play('happy')` 改成 `triggerLaugh()`。
  逻辑：找当前桌宠（或默认奶娃）的「捧腹大笑」视频动作（优先名字含「捧腹大笑」，否则第一个视频动作），
  有就播（视频自带 aac 声音，loop=false，播完自动回待机）；没有就退回「开心跳两下」。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅。
- 待用户 `npm run dev` 实测：点桌宠 → 播捧腹大笑视频 + 出声 → 播完回静态。

### 待办
- 视频动作仍带背景矩形播放（MP4 无透明），且在桌宠小窗口里偏小 → 后续阶段3：视频抠透明 + 播放时临时放大窗口。
- 动作按桌宠各自存：切到默认奶娃照片后，需去「动作」页给它也加一次这个视频动作才能点出笑。

---

## 模板（下次照抄）

### 2026-xx-xx — 标题
- 背景：
- 改了哪些文件：
- 验证结果（实际跑过什么、结果如何）：
- 待办 / 下一步：

---

## 2026-10-14 — 动作视频抠透明（色键抠黑）+ 播放时临时放大窗口

### 背景
用户要求「扣透明」：捧腹大笑动作视频是 MP4 带纯黑背景（四角采样 BGR≈[0,0,0]），播放时会出现黑色矩形。
确认背景是纯黑 → 用色键（chroma key）抠黑，不用 AI 逐帧抠像。

### 改动
- 新增 `src/renderer/src/modules/TransparentVideo.tsx`：
  - 隐藏 `<video>` 播声音 + 逐帧画到 `<canvas>`。
  - 抠黑用「连通域泛洪」：从四条边框出发，只把「连到边框的近黑区域（亮度 ≤ 12）」抠成 alpha=0，
    角色身上的黑眼睛/黑描边因被身体包围、不连边框，不会被误抠。
  - 最长边缩到 260px 等比显示，算出尺寸后通过 `onSizeChange` 回调让窗口跟着视频比例缩放。
- `src/renderer/src/App.tsx`：
  - `renderBody()` 里动作视频片段从 `<video>` 换成 `<TransparentVideo>`（带 `onSizeChange`）。
  - 新增 `idleSizeRef`，静态图/动图/整段视频三处 setSize 都记录待机尺寸；
    新增 effect：`videoClip` 清空后把窗口恢复成待机尺寸。

### 验证结果
- `npm run typecheck` ✅、`npm run build` ✅。
- 待用户 `npm run dev` 实测：点桌宠 → 播捧腹大笑视频，黑背景变透明、只留奶蛙，带声，播完回静态并恢复窗口大小。

### 待办
- 阈值 `BLACK_LUM = 12`、最长边 `TARGET_LONGEST = 260` 是拍脑袋定的，若黑眼睛/描边被误抠或黑边没抠干净，
  调这两个常量即可；极端情况再退回 @imgly 逐帧抠像。

---

## 2026-10-14 — 补记：视频抠透明的方案踩坑

### 背景
第一次用「渲染进程 canvas 连通域抠黑」没立刻生效，用户反馈「视频没变」，于是尝试改成
「ffmpeg colorkey 转透明 WebM + `<video>` 直接播」。

### 结论（重要，以后别重走）
- ffmpeg 的 `colorkey=0x000000` 滤镜本身是对的：转 PNG 实测四角 alpha=0、中心 alpha=255。
- 但本机 ffmpeg 9.0.2（gyan.dev full build）的 `libvpx`/`libvpx-vp9` 编码器**丢 alpha**：
  带 alpha 的 PNG 喂进去，编码输出仍是 `yuv420p`（3 通道），VP9 用 `-pix_fmt yuva444p` 直接报
  "Conversion failed"。WebM 透明这条路在本机走不通。
- 所以最终回到「渲染进程 canvas 实时抠黑」：`TransparentVideo.tsx`，离屏 `<video>` 出声、
  逐帧画 canvas、连通域抠黑；不依赖 ffmpeg，声音自带来。

### 验证
- `npm run typecheck` ✅、`npm run build` ✅。
- 待用户 `npm run dev` 重启后实测点桌宠看效果；若仍不行，按 F12 看 Console 里有没有
  `[TransparentVideo] 开始抠黑 ...` 日志（有=在跑，没=代码没生效/没重启）。

### 待办
- 阈值 `BLACK_LUM=12`、最长边 `TARGET_LONGEST=260` 若黑边抠不干净/眼睛被误抠，调这两个常量。
- 若未来需要「非黑背景」的视频抠透明，再考虑 @imgly 逐帧抠像（本机 WebM alpha 不可用）。

---

## 2026-10-14 — 修正：视频背景是「黑边+白底」，角色是金黄奶蛙

### 背景
用户反馈「他是白底」——之前只采了视频四角，四角恰好是黑边，误判成「纯黑背景」。
重新整帧网格采样发现真实结构：**上下两条黑边 + 中间白底 + 金黄/棕色奶蛙角色**。

### 改动
- `src/renderer/src/modules/TransparentVideo.tsx`：抠背景从「只抠黑」改成「黑边+白底都抠」。
  用两次「从边框泛洪」：亮度 ≤24 的（黑边）、≥235 的（白底）分别抠，取并集；
  只保留中间亮度的黄/棕角色。角色身上的黑眼睛/深描边、亮高光因被身体包围、不连边框，不会被误抠。
- 用 Python（cv2 connectedComponents，与 JS 泛洪等价）在真实帧上验证：
  黑边 24.4% + 白底 23.6% 被抠，保留 52%（平均色 RGB≈187,150,77，正是金黄奶蛙）。

### 验证
- `npm run typecheck` ✅、`npm run build` ✅。
- 待用户 `npm run dev` 重启后实测：点桌宠 → 只看到金黄奶蛙大笑（带声），黑边白底都透明。

### 待办
- 阈值 DARK_LUM=24 / LIGHT_LUM=235、TARGET_LONGEST=260 若边缘抠不干净/角色被误抠，调这几个常量。
- 若以后要抠「复杂背景」视频，再考虑 @imgly 逐帧抠像（本机 WebM alpha 不可用，已踩过坑）。

---

## 2026-10-14 — 修正：白底毛边没抠干净（改「离白+饱和度」软透明度抠像）

### 背景
用户反馈「没扣干净」：黑边白底都能透明了，但奶蛙轮廓边缘残留一圈白毛边。
用 Python 在真实帧上分析毛边：约 4200 个贴背景像素，亮度集中在 210–235（白底和金色奶蛙之间的
抗锯齿过渡色），刚好卡在旧阈值 LIGHT_LUM=235 下面，所以没被抠掉。

### 关键发现（决定了方案）
1. 奶蛙身上**有纯白部分**（离白距离 min=0，22% 像素离白距离<100，是白肚皮/奶白身体），
   而且浅金色高光亮度高达 210+（8% 像素亮度>215）。所以**不能只靠亮度阈值**：
   降亮度会挖穿白肚皮、误伤金色高光。
2. 但白底/白毛边是**低饱和度近中性色**（毛边饱和中位 32），奶蛙金色是**高饱和**（中位 133，
   R 远大于 B）。用饱和度能把白底和金色彻底分开。
3. 白肚皮虽是低饱和，但被金色身体包围、不连背景，靠「从边框泛洪」的连通性天然保护。

### 改动（`src/renderer/src/modules/TransparentVideo.tsx`）
- 抠像从「二值硬抠」改成「软透明度 alpha（0–255）」：
  - 黑边：亮度 ≤ 55 泛洪抠掉（阈值从 24 提到 55，吃掉黑边的压缩噪点）。
  - 白底：改用「离白距离 wd + 饱和度 sat」双条件泛洪。核心白底（wd<30 且 sat<25）全抠；
    软边（wd<95 且 sat<70，连背景）按「白度分数 = max(wd/95, sat/70)」从 0 渐变到 255，
    让白毛边**渐隐**而不是留一圈硬白线。
  - 常量：DARK_LUM=55、WD_CORE=30/WD_MAX=95、SAT_CORE=25/SAT_MAX=70、CORE_SCORE。
- 每帧把 `keyOutBackground` 返回的 alpha 写进 `img.data[..+3]`（原来只写 0）。

### 验证结果（Python 在真实帧上跑，与 JS 逻辑等价）
- 三帧（0/150/301）：全透明 49%+，软边从 4.8% 收到 **1.4%–2.4%**，角色不透明 ~48–49%。
- 角色内部白肚皮/深色描边 **0 误抠**（三帧分别为 0/78094、0/88868、0/95123）。
- `npm run typecheck` ✅、`npm run build` ✅。

### 待办
- 待用户 `npm run dev` 重启实测：点桌宠看奶蛙大笑，轮廓边缘应平滑、无白毛边。
- 若还有极细白边，微调 WD_MAX / SAT_MAX 收紧；若角色边缘被吃，放宽这两个值。
- 更复杂的背景视频仍建议走 @imgly 逐帧抠像（本机 WebM alpha 不可用，已踩过坑）。

---

## 2026-10-15 — 静态桌宠加「果冻肚」晃动

### 背景
用户要静态 PNG 桌宠的肚子能「果冻晃动」：点击肚子弹几下、拖动时肚子滞后晃动（越快越晃）、
松手后自然衰减。要求局部形变（只有肚子动，头/身体不动），不能只移动整图冒充；轻量，不上物理引擎。

### 方案
角色只有一张静态 PNG、没有肚子分割信息，所以用「弹簧-阻尼 + 画布逐行形变」：
- 弹簧-阻尼模拟肚子中心位移（标量 o + 速度 v），点击给初速度、拖动喂垂直速度、松手补一下，自然衰减。
- 渲染把位移当成行波：逐行采样原图、肚子区域每行按「位移 × 余弦包络」上下偏移取源行，
  包络在肚子上下边缘平滑降 0 → 头、腿不动、无接缝。这是真正的局部形变，不是移动整图。
- 肚子区域按可配置的比例参数（默认 top=0.3 / bottom=0.8，图片中下段），可调。

### 改了哪些文件
- 新增 `src/renderer/src/modules/BellyJelly.ts`：弹簧-阻尼类 `BellyJelly` + `drawBellyJelly`
  逐行形变绘制 + `DEFAULT_CONFIG`（stiffness/damping/pokeVelocity/releaseVelocity/dragCoupling/maxAmplitude/maxVelocity）。
- 新增 `src/renderer/src/modules/BellyJellyPet.tsx`：`BellyJellyPet`（forwardRef）用 <canvas> 替代
  静态图原来的 <img>，rAF 每帧推进弹簧 + 重画；暴露 `poke / applyDragVelocity / endDrag`。
- 改 `src/renderer/src/App.tsx`：静态图渲染从 `PetRenderer` 换成 `BellyJellyPet`；
  点击 → 有「捧腹大笑」视频动作照旧播视频，否则 `poke()`（替代原来的 CSS 开心跳）；
  拖动 → `onDragMove` 算垂直速度喂 `applyDragVelocity`，`onDragEnd` 调 `endDrag`；
  首页动作页「开心」预览 → `poke()`。删掉对 `usePetAction`/`PetRenderer` 的引用（两个文件保留未删）。
- 改 `src/renderer/src/styles.css`：加 `.pet-canvas`（100%×100%、pointer-events:none）。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅（渲染进程 57 个模块，新模块已进 bundle）
- 待用户 `npm run dev` 实测：点静态奶蛙 → 肚子 Q 弹；拖动 → 肚子滞后、越快越晃；松手 → 晃几下衰减停止；
  头/身体稳定、透明背景/点击穿透/拖动/上传不受影响。

### 如何调整（重点）
- 肚子位置/大小：`BellyJelly.ts` 的 `DEFAULT_CONFIG.region = { top: 0.3, bottom: 0.8 }`
  （以图片高度为 1，0=顶部 1=底部；奶蛙肚子中下段，可按角色改）。
- 弹得高低：`pokeVelocity`（点击初速度）、`releaseVelocity`（松手补的那下）。
- 晃动快慢/停多久：`stiffness`（刚度，越大回弹越快）、`damping`（阻尼，越大越早停）。
- 拖动跟手程度：`dragCoupling`（越大拖得越快晃得越猛）。
- 上限：`maxAmplitude`（最大位移）、`maxVelocity`（速度上限）。

### 待办
- 若默认奶蛙肚子位置不准，只调 `DEFAULT_CONFIG.region` 即可，无需改代码逻辑。
- 动图/视频桌宠暂不加果冻肚（分别走 GifPlayer / TransparentVideo），需要时再扩展。

### 2026-10-15（续）— 按反馈调小幅度，避免改变角色身材比例
- 用户反馈「晃动幅度太大、别动原模型比例 / 拉长模型」。把默认参数整体调小：
  `pokeVelocity 1.6→0.4`、`releaseVelocity 0.5→0.1`、`dragCoupling 0.5→0.15`、
  `maxAmplitude 0.22→0.06`、`maxVelocity 3.5→1.0`，`region` 从 [0.3,0.8] 收到 [0.35,0.75]。
  现在点击位移约 3%、上限 6%，肚子只是轻微弹一下。
- 说明：肚子移动而头/腿固定，连接的图必然在中间有一点局部压/拉（这就是「拉长」的来源），
  只能压小、无法完全消除；再往下调 `maxAmplitude`/`pokeVelocity` 即可。

---

## 2026-10-15 — 桌宠「360° 高速连续旋转」动作

### 背景
用户要一个独立的「360° 高速连续旋转」动作：约 5 秒内转好几圈，快速、平滑、匀速，结束后平滑停回
0°、不残留角度/缩放；触发方式和点击/拖动无关（单独入口），和果冻肚互不干扰；保留所有现有功能。

### 方案
- 角度曲线：前 85% 匀速、后 15% 三次缓出减速到 0，总角度 = 360° × 整数圈（默认 6 圈），
  这样结束时正好落在 0°、无偏移，且速度在 85% 分界处连续（不顿挫）。
- 缩放包络：开头快速 1 → fit、中间保持、末段随缓停回到 1。
  `fit = min(w,h) / 对角线`，保证旋转过程中角色（最长边）不超出窗口被裁掉；结束 scale 回到 1，不残留缩放。
- 用 CSS `transform: rotate() scale()`（GPU 合成）旋转，不开额外画布重绘；`SpinRotator` 只包一层 div，
  不碰内部果冻肚/点击/拖动逻辑。

### 改了哪些文件
- 新增 `src/renderer/src/modules/Spin.ts`：`SpinController` + `DEFAULT_SPIN = { durationMs: 5000, turns: 6 }`；
  `frameAt(now)` 返回 `{ angle, scale, done }`，`p>=1` 时 `done=true` 并返回 `{angle:0, scale:1}`。
- 新增 `src/renderer/src/modules/SpinRotator.tsx`：`SpinRotator`（forwardRef）包住子元素，
  `start()` 读自身 `clientWidth/Height` 启动控制器 + rAF 循环，逐帧写 `el.style.transform`，结束清空 transform。
- 改 `src/renderer/src/App.tsx`：`renderBody()` 外包 `<SpinRotator ref={spinRef}>`；
  `onTriggerAction` 开头 `if (actionId === 'spin') { spinRef.current?.start(); return }`。
- 改 `src/renderer/src/HomeApp.tsx`：动作页加内置动作「360° 旋转」（静态/默认桌宠显示），
  点「预览」→ `triggerAction('spin')`。
- 改 `src/renderer/src/styles.css`：加 `.pet-rotator`（100%×100%、`transform-origin: center center`、pointer-events:none）。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅（index 725.75kB）
- **计时逻辑用脚本实测通过**（把 Spin.ts 转译成 CJS 后跑 Node 断言，全部 PASS）：
  - 时长：`frameAt(4999ms)` 未结束、`frameAt(5000ms)` 结束 → 正好 5 秒；
  - 圈数：结束前角度 ≈ 2160°（= 360° × 6 圈），终点返回 `{angle:0, scale:1, done:true}`；
  - 角度单调递增、无跳变（每 16ms 最大步进 7.68°）；
  - 85% 分界处速度连续（0.4800 vs 0.4794 deg/ms）。
- ⚠️ GUI 表现（转起来顺不顺、停得自然、有没有被窗口裁边）**未实际运行确认**，需用户 `npm run dev`
  手动验证：首页「动作」页 → 点「360° 旋转」的「预览」。

### 如何调整
- 转多快/几圈/几秒：`Spin.ts` 的 `DEFAULT_SPIN.durationMs`（总时长）、`turns`（圈数，必须整数）。
- 旋转时缩多小：`fit = min(w,h)/对角线` 是自动算的，一般不调；想让窗口不被裁得更保险可把 fit 再乘 0.95。

### 待办
- 待用户实测视觉效果；若觉得转得太快/太慢改 `durationMs`、圈数改 `turns`。
- 目前 `spin` 只对静态/默认桌宠开放入口（GIF/视频桌宠动作页不显示），需要时再放开。

---

## 2026-10-15 — 默认奶蛙「静态姿势动作」（防御/害羞/凝视/搞怪/伤心）

### 背景
用户新增了 5 张静态姿势素材（项目根目录：防御.jpg / 害羞.jpg / 凝视.jpg / 搞怪.png / 伤心.jpg），
都是「已经摆好姿势的单张图」，不存在连续动画帧。要求：按文件名识别动作、每张图一个独立动作、
用位移/旋转/缩放做动画（不拼帧动画）、独立触发、保留透明背景/上传/点击/拖动/果冻肚/360°旋转。

### 图片 → 动作 → 动画方式（以文件名为准）
| 原文件 | 动作 | 叠加的位移动画 |
|---|---|---|
| 防御.jpg | 防御 | 快速左右横向 shake（像格挡震一下） |
| 害羞.jpg | 害羞 | 轻柔左右摇摆（小角度 rotate） |
| 凝视.jpg | 凝视 | 缓慢放大（scale 1→1.1，像凑近注视） |
| 搞怪.png | 搞怪 | 快速左右扭动（rotate wiggle） |
| 伤心.jpg | 伤心 | 轻微下沉 + 微倾（translateY + 小 rotate） |

每个动作：触发 → 切到该姿势图 + 播对应 CSS 位移动画 → 约 2 秒后自动回待机。均为独立触发、
互不绑定（`idle`/其它动作/点击开心/视频动作都会清掉当前姿势）。

### 改了哪些文件
- 新增 `src/renderer/src/modules/PoseActions.ts`：注册表 `STATIC_POSE_ACTIONS`（id/label/imageUrl/motion/durationMs）。
- 复制图片进 `src/renderer/src/assets/poses/`（ASCII 名：defend/shy/gaze/funny/sad），交给 Vite 打包。
- 改 `src/renderer/src/modules/AssetManager.ts`：加 `hasTransparency()`（图自带透明通道就跳过抠图）。
- 改 `src/renderer/src/App.tsx`：
  - 加 `pose` / `poseSpriteUrl` / `poseTimerRef`；`onTriggerAction` 识别 `pose-*` 动作（仅默认奶娃）；
  - 姿势效果：读抠图缓存 → 没有就现抠（`cutoutImage`）并缓存 → `loadPetSprite` 裁包围盒 + 收紧窗口；
    图自带透明则直接用原图；抠图失败退回原图（带背景但姿势照常显示）。
  - `renderBody` 静态路径外包 `.pose-motion .pose-motion--<motion>` div，显示 `poseSpriteUrl ?? spriteUrl ?? imageUrl`；
    待机包围盒效果在姿势激活期间跳过（`pose` 进依赖），姿势结束自动恢复。
  - 计时在「姿势图真正显示出来后」才启动（首次抠图要几秒，不能提前算）。
- 改 `src/renderer/src/HomeApp.tsx`：动作页加「静态姿势动作（默认奶蛙专属）」区（仅 `currentPet === null` 显示），
  每项缩略图 + 名字 + 「预览到桌宠」。
- 改 `src/renderer/src/styles.css`：加 `.pose-motion` + 5 套 `@keyframes`。
- 改 `src/main/PetAssets.ts`：加姿势抠图缓存 `pet-pose-cutouts.json`（按动作 id 存，版本号 `POSE_CUTOUT_VERSION=1`）+ IPC `pet:get-cutout` / `pet:save-cutout`。
- 改 `src/preload/index.ts` + `src/renderer/src/vite-env.d.ts`：加 `getCutout` / `saveCutout` 桥接。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅（5 张姿势图已进 bundle：out/renderer/assets/defend-*.jpg / shy-*.jpg / gaze-*.jpg / funny-*.png / sad-*.jpg）
- ⚠️ GUI 未实际运行验证（本会话看不到 Electron 窗口 / 图片内容显示 Unsupported Image）。需用户 `npm run dev`
  后手动确认：首页「动作」页（默认奶蛙时）→ 点某个姿势「预览到桌宠」→ 桌宠切姿势 + 微动 → 几秒后回待机；
  姿势图背景是否透明（首次要联网抠，之后缓存）。

### 已知限制（受静态素材限制，如实说明）
- 姿势「是否真的像防御/害羞/凝视/搞怪/伤心」只能按文件名判断——本会话读不出图片内容，无法亲眼确认姿势；
  若某张图姿势与名字不符，告诉我实际姿势，我改 `PoseActions.ts` 里的 `motion`（或换动作名）。
- 每个动作只是「姿势图 + 位移动画」，不是逐帧动画；跳跃/旋转这类需要多帧或程序化形变的动作，
  静态单图只能做到「位移/旋转/缩放模拟」，达不到真动画的连贯感。
- 4 张 JPG 有背景、需联网抠图（首次），`搞怪.png` 若已是透明底会跳过抠图直接显示。

### 如何调整
- 动作持续多久：`PoseActions.ts` 里对应条目的 `durationMs`。
- 动画强弱/节奏：`styles.css` 里对应 `@keyframes` 的位移/角度/缩放幅度。
- 姿势图背景没抠干净/误抠：和默认图一样调 `@imgly` 模型，或换 `isnet_quint8`（更快）。

---

## 2026-10-15 — 静态姿势动作可装备 + 自定义触发 + 独立配置持久化 + 新建桌宠可命名

### 背景
在上一版「静态姿势动作」基础上，把动作从「固定 2 秒、手动预览」升级成可自由管理：
1. 每个动作可**独立装备 / 卸载**（equipped）；
2. 每个动作可**自定义触发方式**（manual 手动 / click 单击 / double 双击 / dragStart 开始拖动 /
   dragEnd 停止拖动 / idleRandom 空闲随机）；
3. 每个动作**独立配置**：展示时长 durationMs、播放速度 speed、冷却 cooldownMs；
4. 配置**持久化**，重启不丢；
5. **兼容已有功能**：果冻肚、约 5 秒 360° 旋转、透明背景、上传、点击、拖动都保留；
6. 额外需求「**新建桌宠可命名**」：导入时能改桌宠名字。

### 架构
- 动作的「基础信息」（id/名字/图/动画类型）留在渲染层 `PoseActions.ts`；
  「可配置项」（装备/触发/时长/速度/冷却）由 **main 进程持久化**，存
  `userData/pet-static-action-configs.json`，按动作 id 键值存。
- 两个窗口（首页 + 桌宠）都通过 `getStaticActionConfigs` 读一次 + `onStaticActionConfigsChanged`
  订阅变更；首页改配置 → `saveStaticActionConfigs` 存盘 → 主进程 `sendToPet` 广播 → 桌宠窗口实时生效。
- 渲染层把「基础信息 + 默认配置 + 已存配置」合并成完整 `StaticAction`（缺省用 `DEFAULT_ACTION_CONFIG`）。

### 触发派发（桌宠窗口 App.tsx）
- `fireStaticAction(action, ignoreCooldown?)`：冷却内不重复触发（`lastFiredRef` 记每个动作上次时间）；
  每触发一次都 `setPose({...action})`（新对象，好让姿势 effect 重跑、重计时）。
- `fireTriggered(trigger)`：只在**默认奶娃**（`currentPet === null`）时找「已装备 && 触发方式匹配」的第一个动作。
- 事件接入：单击 → 先 `fireTriggered('click')`，没命中才退回原来的「捧腹大笑/果冻肚」；双击 → `fireTriggered('double')`；
  开始/停止拖动 → `fireTriggered('dragStart'/'dragEnd')`；空闲随机 → 每 8 秒在没有姿势/视频/片段展示时摇一次
  `fireTriggered('idleRandom')`。手动预览仍走 `triggerAction(id)`（忽略冷却）。
- 播放速度：位移动画的 `animation-duration = MOTION_BASE_DURATION[motion] / speed`（inline style 覆盖）。

### 双击判定（PetInteraction.ts）
- 单击 vs 双击：单击先不立即上报，等 `DOUBLE_TAP_MS=320ms` 窗口期，期间又来一次就按双击 `onDoubleTap`，
  否则窗口期结束再报 `onTap`；一旦拖动过就不再和上一次点击凑双击。

### 改了哪些文件
- 改 `src/renderer/src/modules/PoseActions.ts`：拆成「基础信息 + 配置」两层，导出 `MOTION_BASE_DURATION`、
  `DEFAULT_ACTION_CONFIG`、`StaticAction`；移除旧的 `getPoseAction` 和条目内的 `durationMs`。
- 改 `src/main/PetAssets.ts`：加 `StaticActionConfig` 本地类型 + `STATIC_ACTION_TRIGGERS` 校验 + 
  `readStaticActionConfigs/saveStaticActionConfigs/cleanStaticActionConfigs`；新增 IPC
  `pet:get-static-action-configs`、`pet:save-static-action-configs`（存盘后广播 `pet:static-action-configs-changed`）。
- 改 `src/preload/index.ts` + `src/renderer/src/vite-env.d.ts`：加 `getStaticActionConfigs/saveStaticActionConfigs/
  onStaticActionConfigsChanged` 桥接 + 全局 `StaticActionTrigger`/`StaticActionConfig` 类型。
- 改 `src/renderer/src/modules/PetInteraction.ts`：加双击判定 + `onDoubleTap`。
- 改 `src/renderer/src/App.tsx`：加 `staticConfigs` state + 订阅；`staticActions` 合并；`fireStaticAction/fireTriggered`；
  `onTriggerAction` 改用 `staticActions.find`（手动预览忽略冷却）；点击/双击/拖动/空闲随机接入触发派发；
  位移动画按 speed 缩放 `animation-duration`。
- 改 `src/renderer/src/HomeApp.tsx`：静态姿势动作区升级成完整配置 UI（装备勾选、触发下拉、时长/速度/冷却数字输入、
  预览按钮），改一项即 `saveStaticActionConfigs` 存盘；导入页加「桌宠名字」输入框，导入各路径
  （原图/抠图/动图/视频）统一用 `petName.trim() || 原文件名`。
- 改 `src/renderer/src/home.css`：加 `.home-pose-item/.home-pose-config/.home-field/.home-input--num/
  .home-field--name` 样式。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅
- ⚠️ GUI 未实际运行验证（本会话看不到 Electron 窗口）。需用户 `npm run dev` 后手动确认：
  1. 首页「动作」页（默认奶娃）能对 5 个姿势各自装备/卸载、改触发/时长/速度/冷却，改动即时生效；
  2. 按触发方式在桌宠上点/双击/拖动验证对应动作；单点无「单击」动作时仍退回捧腹大笑/果冻肚；
  3. 重启后配置还在；360° 旋转、果冻肚、透明穿透、上传、拖动不受影响；
  4. 导入页能改桌宠名字，导入后样式页显示新名字。

### 本次新增 / 修改 / 复用
- 新增：触发方式系统（manual/click/double/dragStart/dragEnd/idleRandom）、双击判定、
  冷却机制、动作配置持久化（main 进程 JSON）、速度缩放、桌宠命名输入。
- 修改：`PoseActions.ts`（拆基础+配置）、`App.tsx`（触发派发 + 合并配置）、`HomeApp.tsx`（配置 UI + 命名）、
  `PetInteraction.ts`（双击）、`PetAssets.ts`/`preload`/`vite-env.d.ts`（配置 IPC + 类型）。
- 复用：现有姿势抠图缓存（`pet:get-cutout`/`pet:save-cutout`）、`loadPetSprite` 包围盒、
  `onTriggerAction` 动作中转、`sendToPet` 广播、`hasTransparency` 跳过透明图、CSS 位移动画 keyframes。

### 尚未完成 / 待办
- 触发方式目前是「单选」：同一事件（如单击）最多触发一个已装备动作，多个同触发动作只取第一个；如需
  一次触发多个可再扩展成多选。
- 空闲随机是固定 8 秒固定节奏（有多个 idleRandom 动作时取第一个），未做真正的随机间隔/加权。
- 位移动画的时长用「基准时长/speed」线性缩放，速度和「几秒后自动回待机」的 durationMs 是两套独立参数，
  若 speed 过小动画可能没播完就被切回待机（属预期，可按需协调）。
- GUI 表现待用户实测后反馈调参（触发节奏、冷却手感、命名是否进图库/样式页显示）。

---

## 2026-10-15 — 捧腹大笑改为默认桌宠内置动作 + 桌宠重命名

### 背景
1. 用户要求「捧腹大笑视为默认桌宠的默认动作视频，不需要导入」——原来点桌宠播捧腹大笑，前提是用户
   自己去动作页导入一段视频动作；现在要开箱即用：默认奶娃自带这段视频，点桌宠直接播。
2. 用户要求「桌宠重命名也实现一下」——上一版只做了导入时命名，现在要对已导入的桌宠在样式页随时改名。

### 关于内置视频（重要）
- 项目根目录的 `fb849533d275fbd1d8204047255dcdff.mp4`（1080×1920 竖屏，10 秒，h264+aac 带声音）就是
  捧腹大笑素材，本次把它复制成 `src/renderer/src/assets/laugh-video.mp4` 随应用打包。
- 之前顾虑过「奶蛙大笑视频有版权、不自动打包」，现按用户要求改为内置。

### 改动
- 新增 `src/renderer/src/modules/DefaultPetActions.ts`：`BUILTIN_DEFAULT_VIDEO_ACTIONS`（内置「捧腹大笑」，
  `id: 'builtin-laugh'`，dataUrl 存打包后的**资源 URL** 而非 dataURL）+ `isBuiltinVideoAction()`。
- 改 `src/renderer/src/App.tsx`：`effectiveDefaultVideoActions = 内置 + 用户导入的默认动作`；
  `triggerLaugh` 和 `onTriggerAction` 里默认奶娃的动作列表都换成它（导入桌宠仍用各自 videoActions）。
- 改 `src/renderer/src/HomeApp.tsx`：默认奶娃的动作视频列表 = 内置 + 用户导入；内置项打「内置」角标、
  不显示删除按钮；提示文案说明捧腹大笑已内置。
- 改 `src/main/PetAssets.ts`：新增 `pet:rename-image`（按 id 改 library 里的 name + persistLibrary）。
- 改 `src/preload/index.ts` + `vite-env.d.ts`：加 `renameImage(id, name)` 桥接。
- 改 `src/renderer/src/HomeApp.tsx`（样式页）：每张导入卡片加「重命名」按钮，点开就地变输入框
  （Enter/失焦提交、Esc 取消），提交走 `renameImage` + `refreshLibrary`。
- 改 `src/renderer/src/home.css`：加 `.home-badge`（内置角标）、`.home-card-rename`、`.home-rename-input`。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅（`laugh-video-*.mp4` 1,941.67kB 已进 bundle）
- ⚠️ GUI 未实际运行验证。需用户 `npm run dev` 后手动确认：
  1. 不导入任何动作视频时，直接点默认奶娃 → 播自带捧腹大笑视频（带声、抠黑边白底）→ 播完回待机；
  2. 动作页「动作视频」区能看到「捧腹大笑」带「内置」角标、无删除按钮；仍可再导入自己的默认动作；
  3. 样式页对已导入桌宠点「重命名」→ 改名成功，重启后仍保留；
  4. 切到导入的桌宠后，点它不再播默认奶娃的捧腹大笑（各自动作隔离不变）。

### 待办
- 内置视频的 `TransparentVideo` 抠像阈值（DARK_LUM=55 / WD_MAX=95 / SAT_MAX=70 / TARGET_LONGEST=260）
  是针对旧素材调的；这段内置视频若背景结构不同（黑边白底比例变化），边缘抠不干净/误抠需重新调这几个常量。
- 内置动作目前不可编辑（loop/时长/名称固定），需要的话再扩展成「可改但不可删」。
- 根目录原文件 `fb849533d275fbd1d8204047255dcdff.mp4` 已复制进 assets，根目录原件可删（留着也行）。

---

## 2026-10-15 — 每 N 次动作自动播捧腹大笑（可配置触发规则）

### 背景
用户「每进行三次动作自动播放捧腹大笑也可设定触发规则」：上一个动作做完 N 次后，自动插播一次
捧腹大笑；这个 N（以及开关）要能在首页配置。

### 方案（关键设计）
- 用一个动作计数器 `actionTick`（数字 state）：每触发一次「被计数的动作」就 `setActionTick(t => t + 1)`。
- 一个 effect 监听 `actionTick`：`actionTick !== 0 && actionTick % everyNActions === 0` 时调 `playLaugh()`。
- `playLaugh()` 本身**不再 +1**，避免「大笑触发大笑」的死循环。
- 计数只算「真的动作」：静态姿势动作（`fireStaticAction`）、360° 旋转、动作视频片段、GIF 帧区间动作、
  开心/弹肚子（点击退回路径）。`idle`（待机）不算。
- 单击到底算 1 次：点一下要么命中 `fireStaticAction('click')`、要么走 `triggerLaugh`/`poke` 退回路径，
  两条路径各 +1，绝不重复 +1。

### 改了哪些文件
- 改 `src/main/PetAssets.ts`：新增 `AutoLaughConfig { enabled, everyNActions }` 本地类型 + 校验
  `isAutoLaughConfig` + `DEFAULT_AUTO_LAUGH_CONFIG = { enabled: true, everyNActions: 3 }` +
  `readAutoLaughConfig/saveAutoLaughConfig`（存 `userData/pet-auto-laugh-config.json`）；新增 IPC
  `pet:get-auto-laugh-config` / `pet:save-auto-laugh-config`（存盘后广播 `pet:auto-laugh-config-changed`）。
- 改 `src/preload/index.ts` + `src/renderer/src/vite-env.d.ts`：加 `getAutoLaughConfig/saveAutoLaughConfig/
  onAutoLaughConfigChanged` 桥接 + 全局 `AutoLaughConfig` 类型。
- 改 `src/renderer/src/App.tsx`（桌宠窗口）：加 `autoLaughConfig` + `actionTick` state + 读/订阅 effect +
  自动大笑 effect；在 `fireStaticAction`、`onTriggerAction` 的 spin / 视频片段 / GIF 动作 / happy 分支里
  `setActionTick(+1)`；抽 `playLaugh`/`triggerLaugh`。
- 改 `src/renderer/src/HomeApp.tsx`（首页）：加 `autoLaughConfig` state + 读/订阅 effect + `updateAutoLaughConfig`；
  动作页新增「自动捧腹大笑」配置区（启用勾选 + 「每 N 次动作」数字输入，N 下限 1）。
- 改 `src/renderer/src/home.css`：`.home-input--num` 加 `flex: none; min-width: 0`（数字输入不被 flex 拉宽）。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅
- ⚠️ GUI 未实际运行验证。需用户 `npm run dev` 后手动确认：
  1. 连续触发 3 次动作（如点桌宠 3 下、或首页预览几个动作），第 3 次时自动插播捧腹大笑（带声）；
  2. 首页「动作」页把 N 改成 1/5，或关掉「启用」，桌宠行为随之变化（关掉后不再自动大笑）；
  3. 重启后 N 和开关还在（持久化）。

### 本次新增 / 修改 / 复用
- 新增：`AutoLaughConfig` 持久化 + IPC + 双窗口订阅、「每 N 次动作」计数与自动插播、首页配置 UI。
- 修改：`PetAssets.ts`（配置读写 + IPC）、`preload/index.ts` + `vite-env.d.ts`（桥接 + 类型）、
  `App.tsx`（actionTick 计数 + 自动大笑 effect）、`HomeApp.tsx`（配置 UI）、`home.css`（数字输入不拉宽）。
- 复用：`playLaugh` 的取动作逻辑（内置捧腹大笑 → 导入桌宠各自视频动作 → 无则弹肚子）、
  `sendToPet` 广播、`onTriggerAction` 动作中转。

### 尚未完成 / 待办
- 「每 N 次动作」是全局计数（不区分动作种类、跨桌宠不清零）。若要「每类动作各自计数」或「切换桌宠时
  清零」，需要把 `actionTick` 按维度拆分，目前没这个需求。
- 自动大笑用的是 `playLaugh()`（对导入桌宠若没视频动作则退化成弹肚子），和手动点击捧腹大笑同一条路径；
  若想让导入桌宠的自动大笑有不同表现，需单独扩展。

---

## 2026-10-15 — 修「捧腹大笑重复出现」+ 动作视频加「应用」开关

### 背景
1. 用户反馈「捧腹大笑会有三个默认界面」——动作页里捧腹大笑出现得冗余/重复。
2. 用户要求「这个视频动作加个应用功能，选择一个或多个使用」——动作视频要有「应用/启用」开关，勾选哪些就用哪些。

### 排查出的重复根因（真 bug）
- 首页 `handleDeleteVideoAction` 删动作时，把**整个 `currentVideoActions`（含内置捧腹大笑）** 当成
  `updateVideoActions` 的入参发出去；主进程 `pet:update-video-action`（id 为 null 时）会把这份列表
  **原样写进 `default-pet-video-actions.json`**。
- 内置捧腹大笑的 `dataUrl` 是打包资源 URL（非 dataURL），被写进持久化后，下次启动就成了「用户动作」，
  和渲染层写死的内置动作重叠 → 列表里出现多个捧腹大笑。删几次就叠几次，和之前手动导入过的旧捧腹大笑一起，
  就凑成了「三个」。

### 改动
- 修 `src/renderer/src/HomeApp.tsx` 的 `handleDeleteVideoAction` / 新增的 `handleToggleVideoAction`：
  发 `updateVideoActions` 前先 `filter(!isBuiltinVideoAction)`，内置动作永远不进持久化。
- 修 `src/main/PetAssets.ts` 的 `readDefaultVideoActions`：只保留 `dataUrl.startsWith('data:')` 的
  用户导入动作，把可能已误写进 JSON 的内置动作（资源 URL）也过滤掉，自动修复旧脏数据。
- 动作视频加「应用/启用」开关（`VideoActionDef.enabled?: boolean`，缺省启用）：
  - `src/main/PetAssets.ts` + `preload` + `vite-env.d.ts`：`enabled` 字段 + `isVideoActionDef` 校验；
    内置动作的 enabled 单独持久化到 `pet-builtin-video-action-config.json`（`{ enabled: Record<id,boolean> }`），
    新增 IPC `pet:get/save-builtin-video-action-config` + 广播 `pet:builtin-video-action-config-changed`。
  - `src/renderer/src/App.tsx`：`effectiveDefaultVideoActions` 给内置动作按配置合并 `enabled`；
    `playLaugh()` 只从「已启用」的动作里挑（点击/自动大笑生效），没有就退回果冻肚。
  - `src/renderer/src/HomeApp.tsx`：`currentVideoActions` 合并内置 enabled；动作列表每项加「应用」勾选框
    （内置/导入都有），改即存盘；「预览到桌宠」仍对未启用动作可用（和静态姿势的「装备」一致，手动预览不受限）。
- 顺带改动作视频区提示文案，说明「应用」的作用。

### 验证结果（实际跑过）
- `npm run typecheck` ✅
- `npm run build` ✅
- ⚠️ GUI 未实际运行验证。需用户 `npm run dev` 后手动确认：
  1. 动作页「动作视频」里捧腹大笑只出现一次（内置那条），不再有重复；
  2. 每个动作视频前有「应用」勾选框，可勾一个或多个；取消勾选后点桌宠 / 自动大笑不再播它，
     但手动「预览到桌宠」仍能播；
  3. 重启后勾选状态保留。

### 本次新增 / 修改 / 复用
- 新增：`VideoActionDef.enabled` 应用开关、内置动作 enabled 持久化（`pet-builtin-video-action-config.json`）
  + 一套 IPC/广播、首页动作视频「应用」勾选 UI。
- 修改：`HomeApp.tsx`（内置不入持久化 + 应用勾选）、`PetAssets.ts`（enabled 校验 + 读库过滤 data: + 内置开关 IPC）、
  `App.tsx`（合并 enabled + playLaugh 过滤）、`preload`/`vite-env.d.ts`（桥接 + 类型）。
- 复用：`sendToPet` 广播、双窗口「读一次 + 订阅」配置同步套路（同 static/auto-laugh 配置）、
  `isBuiltinVideoAction` 判断。

### 尚未完成 / 待办
- 「应用」只影响点击/自动大笑的自动触发；手动预览仍对所有动作可用（与静态姿势「装备」行为一致）。
  若希望未启用动作连预览按钮都禁掉，可再加。
- 若用户曾手动导入过旧版捧腹大笑（dataURL 形式），那仍是合法用户动作、会继续显示，需在首页手动删除；
  本次只清理了「内置动作被误写进 JSON」这一种重复。

---

## 2026-10-15 — 首页 UI 视觉优化（紫色渐变主题）

### 背景
用户给了首页效果图，要求优化首页 UI（不是重做）。效果图要点：柔和紫色渐变、圆角卡片、精致图标、
角色展示区、动作库、快捷操作区。约束：保留现有结构和业务逻辑、复用组件、不删素材/动作/上传/拖动/配置/持久化；
**首页可以有背景和卡片，桌宠窗口必须保持透明**；只显示真实数据；不引入大型 UI 库。

### 方案（低风险，纯视觉 + 只增不改）
- 只动 `home.css`（首页样式，本身已被 `html.home-page` 作用域隔离）和 `HomeApp.tsx` 的展示层；
  **完全不碰 `styles.css`（桌宠窗口透明样式）和 `App.tsx`（桌宠窗口逻辑）**。
- 紫色渐变背景只加在 `html.home-page body` 上，桌宠窗口不受影响。

### 改了哪些文件
- 新增 `src/renderer/src/modules/HomeIcons.tsx`：内联 SVG 线性图标（upload/zap/grid/eyeOff/eye/smile/rotate/pause），
  无任何依赖，跟 `currentColor` 换色。
- 重写 `src/renderer/src/home.css`：紫色渐变背景、圆角卡片、阴影、紫色主色按钮、hover 抬升、
  标签页 pill 化 + 激活渐变、输入框 focus 紫色描边；**保留全部原有类名**，只改视觉。
- 改 `src/renderer/src/HomeApp.tsx`（只加展示层，不动任何 handler/state/effect）：
  - 顶部新增「角色展示区」hero：显示当前桌宠（默认奶娃 / 已导入桌宠）的缩略图 + 名字 + 状态，只读真实数据
    （`currentPet` / `defaultThumb` / `library`），视频桌宠用 `<video>` 预览。
  - 顶部新增「快捷操作区」：隐藏 / 显示 / 开心 / 旋转（分别映射已有的 `hide`/`show`/`triggerAction`）。
  - 三个标签页 + 三个内置动作（待机/开心/旋转）加图标。

### 验证结果
- `npm run typecheck` ✅
- `npm run build` ✅（渲染进程 68 个模块，HomeIcons 已进 bundle，index CSS 8.1→12.3kB）
- `npm run dev` 的 vite 编译阶段通过（main/preload/renderer 都 build successfully），但 **Electron 窗口没能在本会话
  启动**：本 shell 设了 `ELECTRON_RUN_AS_NODE=1`，electron 被当纯 Node 跑，`electron.app` 为 undefined → 启动即退。
  这是环境限制，不是代码问题；用户需在正常终端 `npm run dev` 亲眼看效果。

### 待办
- 待用户 `npm run dev` 实测：紫色渐变/卡片/图标/hero 展示是否满意；确认桌宠窗口仍透明、交互只在人物范围。
- 效果图里若还有想照搬的细节（具体配色深浅、图标风格、卡片间距），告诉我继续微调；本次因本会话读不出图片，
  是按文字描述做的近似。

### 风险说明（已规避）
- 首页样式全部限定在 `.home-*` / `html.home-page`，不会串到透明桌宠窗口。
- hero 的「快捷操作」只用已有的 `hide`/`show`/`triggerAction` IPC，未新增 IPC、未改 main 进程。
- 未删任何素材/动作/配置/持久化逻辑；原有三个标签页功能原样保留。

## 2026-10-15 — 手机网页版 + 打包 exe（Windows 版原样保留）

### 背景
用户要两件事：① 做一个手机浏览器能打开的网页版；② 把现有项目打包成 exe。要求不重写、不迁移、
Windows 版桌宠和全部功能保留。

### 方案（最小改动，纯「加外壳」，零重写）
- **网页版**：核心是给 `window.desktopPet` 写一个「浏览器版实现」，让 `App.tsx` / `HomeApp.tsx` 两个组件**原样复用、
  一行不改**。桌面版里这个对象走 IPC（读写 JSON 文件 / 控制窗口 / 弹文件框 / 跨窗口通信），网页版替换成：
  - 数据读写 → IndexedDB（结构/默认值/版本/清洗和 `PetAssets.ts` 完全一致）
  - 窗口控制 → 交给 `WebApp` 注册的 `PetController` 操作浮动 DOM（`setSize`→改容器尺寸、`drag*`→在页面内拖动、`hide/show`→显隐）
  - 选文件 → `<input type=file>`；跨窗口通信 → 页面内事件总线
  - 桌面「透明置顶窗口」在浏览器里不存在，网页版是**页面内右下角浮动桌宠**（可拖动），首页和桌宠合成一个页面。
- **打包**：主进程/预加载只 `require('electron')` 和 `node:` 内置模块、渲染层已被 electron-vite 完整打包，
  → 运行时不需要 node_modules，所以把依赖全部移到 devDependencies、electron-builder 只打包 `out/**`。

### 改了哪些文件
- 新增 `src/renderer/src/web/bridge.ts`：IndexedDB KV + 事件总线 + PetController + 完整 DesktopPetApi 实现。
- 新增 `src/renderer/src/web/WebApp.tsx`：`<HomeApp/>` + 浮动 `<App/>` 合成一页，注册 PetController。
- 新增 `src/renderer/src/web/main.tsx`：网页入口，先 `initWebBridge()` 再渲染，给 html 打 `home-page`。
- 新增 `src/renderer/src/web/web.css`：从 styles.css 摘出 `.pet-*`/`.pose-motion-*` + 浮动容器 + 手机微调。
- 新增 `src/renderer/web.html`、`vite.web.config.ts`（纯 Vite，base './'，输出 dist-web）。
- 新增 `electron-builder.yml`（files 只含 out/，asarUnpack bg-removal，nsis+portable 双目标）。
- 新增 `.npmrc`：electron/electron-builder 走阿里云镜像（国内下 GitHub 会超时）。
- 改 `package.json`：加 `build:web`/`preview:web`/`pack`/`dist` 脚本；deps 移进 devDependencies；加 electron-builder、vite。

### 验证结果
- `npm run typecheck` ✅
- `npm run build`（electron-vite）✅ 68 模块，web.html 未被误打进桌面版
- `npm run build:web` ✅ 71 模块，dist-web 124MB（含 85MB 抠图模型 + 12MB wasm）
- `npm run dist`（打包）✅ 产出 `release/MilkFrogPet Setup 0.1.0.exe` 和
  `release/milk-frogs-beast-bond-sutra-0.1.0-portable.exe`，各 178MB；app.asar 83MB + bg-removal 已正确解包。
  首次打包因 GitHub 下 NSIS 超时失败，加 `.npmrc` 镜像后成功。
- **环境限制**：本会话 shell 设了 `ELECTRON_RUN_AS_NODE=1` 且无浏览器，无法实测 Electron 窗口 / 网页交互，
  交互部分（拖动、点笑、导入、抠图）需用户在本机跑起来看。

### 待办
- 用户本地实测网页版：`npm run preview:web`（拖动 / 点击大笑 / 导入图片）。
- 网页版部署到静态托管时，抠图用的多线程 WASM 需要 HTTPS + `Cross-Origin-Isolation` 响应头（COOP/COEP），
  需选支持自定义头的托管（Netlify / Cloudflare Pages 等）。
- 抠图模型 88MB fp16 偏大，移动端建议换 `isnet_quint8`（约 44MB）并按需下载。
- 打包版「一键抠图」在 file:// 协议下 fetch 模型可能受限（未实测），需用户跑打包版验证；其余功能不受影响。
- 打包版目前用默认 Electron 图标，可后续加自定义 icon。

### 风险说明（已知、已说明）
- 网页版是「页面内浮动桌宠」，不是桌面透明置顶窗口（浏览器硬限制）。
- 网页数据存浏览器 IndexedDB，不跨设备；iOS Safari 长时间不用可能清掉数据。
- 打包版体积 178MB 主要来自内嵌抠图模型，属正常（换小模型可显著减小）。

---

## 2026-10-16 — 修复网页版「抠图失败：Unexpected token '<'... is not valid JSON」

### 现象
网页版点抠图时报 `Unexpected token '<', "<!doctype"... is not valid JSON`。

### 根因
上一次提交 `f5a62fd`「修复网页版抠图失败问题」把部署目录里的模型**改错了名字**：
`dist-web/bg-removal/resources.json` → `dist-web/model/config.json`（目录和文件名都改了）。
但 `@imgly/background-removal@1.7.0` 的 `loadAsBlob` 硬编码 fetch `publicPath + "resources.json"`，
`BackgroundRemoval.ts` 里 `publicPath` 仍是 `bg-removal/`。于是去 fetch `bg-removal/resources.json` 404，
静态服务器 SPA 回退返回 `index.html`（200），`.json()` 解析 HTML 就报 `Unexpected token '<'`。

### 修法
1. 把 `dist-web/model/` 改回 `dist-web/bg-removal/`，`config.json` 改回 `resources.json`
   （内容没动，纯改名，恢复库和代码期待的路径）。
2. 删掉 `.gitignore` 里 `dist-web/bg-removal/*.onnx` 这一行——因为 `dist-web/` 是走 git 部署的，
   onnx 必须进仓库，否则部署后抠图模型缺失。
3. `vite.web.config.ts` 加 `preview.headers`（COOP/COEP），让本地 `npm run preview:web` 也能测抠图
   （多线程 wasm 需要跨域隔离，部署版靠 `dist-web/_headers`）。

### 验证（curl，无浏览器环境）
- `vite preview` 起服务后：
  - `GET /bg-removal/resources.json` → 200 `application/json`（不再是 index.html 回退）✅
  - `GET /bg-removal/isnet_fp16.onnx` → 200，88152708 字节 ✅
  - `GET /bg-removal/ort-wasm-simd-threaded.wasm` → 200 `application/wasm` ✅
  - 首页和资源都带 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` ✅
- 交互仍无法在本环境实测（无浏览器），抠图效果需用户本地/部署后点一次确认。

### 待办
- 用户重新部署（提交 `dist-web/bg-removal/`）后在真机点一次「一键抠图」确认。
- 仍然建议后续换 `isnet_quint8` 小模型，减小部署/下载体积。

---

## 2026-10-16 — Cloudflare 仍报同样错误：模型超 25MB 单文件上限

### 根因
Cloudflare Pages **限制单个文件 ≤ 25 MiB**（官方文档）。`isnet_fp16.onnx` 有 88MB，超上限，
上传时整次部署被拒/失败，于是线上一直是旧的那套 `model/config.json`，`resources.json` 仍 404 → 回退 index.html → 同样的 `Unexpected token '<'`。

### 修法
- 把 88MB 的 `isnet_fp16.onnx` 切成 4 片（每片 22MB，低于 25MB），`resources.json` 里模型条目改成 4 个 chunk（`offsets` 按字节顺序累加）。
  库 `@imgly/background-removal` 本身支持多 chunk：逐个 fetch `publicPath + chunk.name`、按 size 校验、再拼接，所以切分对它透明。
- 重写 `scripts/setup-bg-removal.mjs`：自动切分 + 删除单个大文件（加重试 + 失败即报错）+ 从实际分片重建 `resources.json`。
- 同步 `src/renderer/public/bg-removal/`（源，供本地/桌面构建）与 `dist-web/bg-removal/`（部署目录）。
- 顺带把 wasm/mjs 重新从当前 node_modules 拷贝（wasm 从 11.8MB → 12.6MB，匹配当前 onnxruntime-web 版本）。

### 验证（curl，无浏览器）
- `vite preview` 起服务：
  - `/bg-removal/resources.json` → 200 `application/json` ✅
  - `/bg-removal/isnet_fp16.{0,1,2,3}.onnx` → 各 200，22,038,177 字节 ✅
  - `/bg-removal/ort-wasm-simd-threaded.wasm` → 200 `application/wasm` ✅
- 所有文件均 < 25MB，满足 Cloudflare Pages 单文件上限。

### 待办
- 用户提交 `dist-web/bg-removal/`（4 片 + resources.json，已无单个 88MB 文件）并重新部署。
- 部署后在浏览器控制台确认 `crossOriginIsolated === true`（`_headers` 的 COOP/COEP 是否生效），
  否则多线程 wasm 会报 SharedArrayBuffer 相关错误。

