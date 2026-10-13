# Milk Frog's Beast-Bond Sutra

一个按照 `.agents/skills/desktop-pet-tutor/SKILL.md` 逐步开发的 Windows 桌宠项目。

## 当前阶段：基础架构

当前版本只完成最小可运行骨架：

- Electron 主进程创建透明、无边框、置顶窗口
- Preload 通过安全桥接暴露有限的桌宠 API
- React 渲染进程显示占位桌宠界面
- 支持拖动窗口、隐藏窗口和关闭程序
- React 可以读取主进程返回的系统信息
- 桌宠具有待机、开心和拖动三种基础状态
- 点击角色可以触发互动反馈
- 系统托盘可以显示、隐藏和退出桌宠
- 窗口位置会保存到 Electron 的本地用户数据目录

## 运行方式

在项目根目录执行：

```powershell
npm install
npm run dev
```

开发窗口启动后，可以拖动角色区域移动窗口，点击右上角按钮隐藏或退出。

## 目录职责

```text
src/main/                 Electron 主进程，负责窗口和系统能力
src/preload/              安全桥接，只暴露允许给前端使用的 API
src/renderer/             React 前端，负责界面和用户交互
vite.config.ts            Electron-Vite 和 React 构建配置
```

## 第二阶段验证

启动后可以检查：

1. 桌宠会持续进行轻微待机动画。
2. 点击角色后，状态会暂时变为“被摸到了，好开心”。
3. 拖动桌宠卡片时，状态会变为“跟着你一起移动”。
4. 点击隐藏按钮后，可以从 Windows 系统托盘恢复桌宠。
5. 退出后重新启动，窗口会尝试恢复上次位置。

## 常用检查

```powershell
npm run typecheck
npm run build
```

`typecheck` 只检查 TypeScript 类型；`build` 检查主进程、Preload 和 React 前端是否可以构建。

## 开发记录

每次改动的背景、验证结果和待办都记录在 [DEVELOPMENT.md](DEVELOPMENT.md)，下次继续开发前先看它。
