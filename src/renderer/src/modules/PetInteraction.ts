import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

// PetInteraction：处理鼠标。负责三件事——
// 1) 区分「点击」和「拖动」（移动超过阈值算拖动）
// 2) 点击穿透：光标下像素透明就 setIgnoreMouse(true)
// 3) 把结果通过回调交给上层（App 决定点击→开心、拖动→移窗口）

const DRAG_THRESHOLD = 4

export interface PetInteractionHandlers {
  onTap: () => void
  onDragStart: () => void
  onDragMove: () => void
  onDragEnd: () => void
}

export function usePetInteraction(
  stageRef: RefObject<HTMLElement | null>,
  alphaCanvasRef: RefObject<HTMLCanvasElement | null>,
  handlers: PetInteractionHandlers,
) {
  const downPos = useRef<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)
  const lastIgnore = useRef<boolean | null>(null)

  // 鼠标没按下的移动：判断光标下的像素是否透明，透明就让点击穿透
  const updateIgnoreMouse = (clientX: number, clientY: number) => {
    const canvas = alphaCanvasRef.current
    const stage = stageRef.current

    if (!canvas || !stage) {
      return
    }

    const rect = stage.getBoundingClientRect()
    const x = Math.floor(((clientX - rect.left) / rect.width) * canvas.width)
    const y = Math.floor(((clientY - rect.top) / rect.height) * canvas.height)

    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
      return
    }

    const alpha = canvas.getContext('2d')?.getImageData(x, y, 1, 1).data[3] ?? 255
    const shouldIgnore = alpha === 0

    // 只在状态变化时通知主进程，避免每个 mousemove 都发一次
    if (lastIgnore.current !== shouldIgnore) {
      lastIgnore.current = shouldIgnore
      window.desktopPet.setIgnoreMouse(shouldIgnore)
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // 捕获指针：拖动时即使鼠标移出窗口，也能继续收到 move/up 事件
    event.currentTarget.setPointerCapture(event.pointerId)
    downPos.current = { x: event.clientX, y: event.clientY }
    isDragging.current = false
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (downPos.current) {
      const dx = event.clientX - downPos.current.x
      const dy = event.clientY - downPos.current.y

      // 移动超过阈值 → 进入拖动
      if (!isDragging.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        isDragging.current = true
        handlers.onDragStart()
      }

      if (isDragging.current) {
        handlers.onDragMove()
      }
    } else {
      updateIgnoreMouse(event.clientX, event.clientY)
    }
  }

  const onPointerUp = () => {
    const wasDragging = isDragging.current
    downPos.current = null
    isDragging.current = false

    if (wasDragging) {
      handlers.onDragEnd()
    } else {
      handlers.onTap()
    }
  }

  return { onPointerDown, onPointerMove, onPointerUp }
}
