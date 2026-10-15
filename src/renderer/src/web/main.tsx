import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initWebBridge } from './bridge'
import WebApp from './WebApp'
import './web.css'

// 网页版入口：先把 window.desktopPet 换成浏览器实现，再渲染。
// 首页样式沿用 home.css（通过 HomeApp 引入），桌宠样式在 web.css 里单独提供。
async function bootstrap(): Promise<void> {
  document.documentElement.classList.add('home-page')

  await initWebBridge()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <WebApp />
    </StrictMode>,
  )
}

void bootstrap()
