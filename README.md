# Milk Frog's Beast-Bond Sutra

一个按照 `.agents/skills/desktop-pet-tutor/SKILL.md` 逐步开发的 Windows 桌宠项目。

## 当前阶段：基础架构

当前版本只完成最小可运行骨架：

- Electron 主进程创建透明、无边框、置顶窗口
- Preload 通过安全桥接暴露有限的桌宠 API
- React 渲染进程显示占位桌宠界面
- 支持拖动窗口、隐藏窗口和关闭程序
- React 可以读取主进程返回的系统信息

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

## 常用检查

```powershell
npm run typecheck
npm run build
```

`typecheck` 只检查 TypeScript 类型；`build` 检查主进程、Preload 和 React 前端是否可以构建。
