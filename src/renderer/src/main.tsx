import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import HomeApp from './HomeApp'
import './styles.css'

// 首页窗口和桌宠本体共用这一个入口，用 ?view=home 区分。
const isHome = new URLSearchParams(window.location.search).get('view') === 'home'

if (isHome) {
  // 给 <html> 打标记，让 home.css 的样式只作用于首页窗口
  document.documentElement.classList.add('home-page')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isHome ? <HomeApp /> : <App />}</StrictMode>,
)
