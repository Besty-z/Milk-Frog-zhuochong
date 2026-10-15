import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'
import { DEFAULT_SPIN, SpinController, type SpinConfig } from './Spin'

// SpinRotator：把子元素（桌宠本体）包一层，触发 start() 后绕自身中心高速旋转约 5 秒，
// 结束时恢复 0°、原大小。用 CSS transform 旋转（GPU 合成），不开额外的画布重绘，
// 也不和内部的果冻肚 / 点击 / 拖动逻辑发生关系。

export interface SpinHandle {
  start: () => void
}

interface SpinRotatorProps {
  config?: Partial<SpinConfig>
  children: ReactNode
}

export const SpinRotator = forwardRef<SpinHandle, SpinRotatorProps>(function SpinRotator(
  { config, children },
  ref,
) {
  const divRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<SpinController | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    controllerRef.current = new SpinController({ ...DEFAULT_SPIN, ...config })
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      start: () => {
        const controller = controllerRef.current
        const div = divRef.current
        if (!controller || !div) {
          return
        }

        // 角色显示尺寸 = 这个包裹层的尺寸（窗口本来就被收到角色包围盒）
        controller.start(performance.now(), div.clientWidth, div.clientHeight)

        if (rafRef.current) {
          return // 已在旋转中：重置了起始时间，复用现有循环即可
        }

        const tick = (now: number) => {
          const frame = controller.frameAt(now)
          const el = divRef.current
          if (el) {
            // 结束清空 transform → 恢复 0°、原大小
            el.style.transform = frame.done ? '' : `rotate(${frame.angle}deg) scale(${frame.scale})`
          }

          if (frame.done) {
            rafRef.current = 0
          } else {
            rafRef.current = requestAnimationFrame(tick)
          }
        }

        rafRef.current = requestAnimationFrame(tick)
      },
    }),
    [],
  )

  return (
    <div ref={divRef} className="pet-rotator">
      {children}
    </div>
  )
})
