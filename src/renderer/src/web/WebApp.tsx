import { useEffect, useRef } from 'react'
import App from '../App'
import HomeApp from '../HomeApp'
import { attachPetController, type PetController } from './bridge'

// WebApp：网页版根组件。和桌面版的区别是「两个窗口合成一个页面」——
// 首页（HomeApp）是页面主体，桌宠（App）变成右下角一个可拖动的浮动层。
// 桌宠的「窗口控制」通过 PetController 操作浮动层 DOM，其余逻辑两个组件原样复用。

function WebApp() {
  const floatRef = useRef<HTMLDivElement>(null)
  const posRef = useRef({ x: 0, y: 0 })
  const placedRef = useRef(false)
  const dragRef = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const applyPos = (): void => {
      const el = floatRef.current
      if (!el) {
        return
      }
      el.style.left = `${posRef.current.x}px`
      el.style.top = `${posRef.current.y}px`
    }

    const controller: PetController = {
      setSize(width, height) {
        const el = floatRef.current
        if (!el) {
          return
        }
        // 限制在视口内，避免动作视频横屏时撑爆屏幕
        const maxW = Math.max(48, window.innerWidth - 24)
        const maxH = Math.max(48, window.innerHeight - 24)
        const scale = Math.min(1, maxW / width, maxH / height)
        const w = Math.max(24, Math.round(width * scale))
        const h = Math.max(24, Math.round(height * scale))
        el.style.width = `${w}px`
        el.style.height = `${h}px`

        // 第一次出现时放到右下角
        if (!placedRef.current) {
          placedRef.current = true
          posRef.current = { x: window.innerWidth - w - 16, y: window.innerHeight - h - 16 }
          applyPos()
        }
      },
      dragStart(screenX, screenY) {
        dragRef.current = { sx: screenX, sy: screenY, x: posRef.current.x, y: posRef.current.y }
      },
      dragMove(screenX, screenY) {
        const d = dragRef.current
        if (!d) {
          return
        }
        posRef.current = { x: d.x + (screenX - d.sx), y: d.y + (screenY - d.sy) }
        applyPos()
      },
      dragEnd() {
        dragRef.current = null
      },
      hide() {
        floatRef.current?.classList.add('web-pet--hidden')
      },
      show() {
        floatRef.current?.classList.remove('web-pet--hidden')
      },
    }

    attachPetController(controller)
    return () => attachPetController(null)
  }, [])

  return (
    <>
      <HomeApp />
      <div className="web-pet-float" ref={floatRef} aria-label="桌宠">
        <App />
      </div>
    </>
  )
}

export default WebApp
