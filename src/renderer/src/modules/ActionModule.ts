import { useCallback, useEffect, useRef, useState } from 'react'

// ActionModule：动作状态机。桌宠当前在做什么动作，由这里统一管理。
// 现在有 3 个动作：idle（待机）、happy（开心）、drag（拖动）。
// 以后要加「睡觉」「说话」等，就在 PetAction 和 ACTION_DURATION 里加即可。

export type PetAction = 'idle' | 'happy' | 'drag'

// 每个动作的持续时间（毫秒）。没列出的动作会一直持续，直到调用 stop()。
const ACTION_DURATION: Partial<Record<PetAction, number>> = {
  happy: 1600,
}

export function usePetAction() {
  const [action, setAction] = useState<PetAction>('idle')
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // 播放一个动作；若该动作有时长，到点自动回到 idle
  const play = useCallback(
    (next: PetAction) => {
      clearTimer()
      setAction(next)

      const duration = ACTION_DURATION[next]
      if (duration !== undefined) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          setAction('idle')
        }, duration)
      }
    },
    [clearTimer],
  )

  // 立即停止当前动作，回到 idle
  const stop = useCallback(() => {
    clearTimer()
    setAction('idle')
  }, [clearTimer])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      clearTimer()
    }
  }, [clearTimer])

  return { action, play, stop }
}
