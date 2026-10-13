import { useEffect, useRef, useState } from 'react'
import petImage from './assets/pet.jpg'

type PetState = 'idle' | 'happy' | 'dragging'

function App() {
  const [platform, setPlatform] = useState('正在连接本地应用层...')
  const [petState, setPetState] = useState<PetState>('idle')
  const resetStateTimer = useRef<number | null>(null)

  const resetPetStateLater = (delay: number) => {
    if (resetStateTimer.current) {
      window.clearTimeout(resetStateTimer.current)
    }

    resetStateTimer.current = window.setTimeout(() => {
      resetStateTimer.current = null
      setPetState('idle')
    }, delay)
  }

  useEffect(() => {
    void window.desktopPet.getSystemInfo().then((systemInfo) => {
      setPlatform(`运行于 ${systemInfo.platform}`)
    })

    const removeWindowMovedListener = window.desktopPet.onWindowMoved(() => {
      setPetState('dragging')
      resetPetStateLater(450)
    })

    return () => {
      removeWindowMovedListener()
      if (resetStateTimer.current) {
        window.clearTimeout(resetStateTimer.current)
      }
    }
  }, [])

  const handlePetClick = () => {
    setPetState('happy')
    resetPetStateLater(1600)
  }

  const stateText = {
    idle: '正在安静待机',
    happy: '被摸到了，好开心',
    dragging: '跟着你一起移动',
  }[petState]

  return (
    <main className="pet-stage" aria-label="桌宠窗口">
      <section className="pet-card">
        <div className="window-actions no-drag">
          <button type="button" aria-label="隐藏桌宠" title="隐藏桌宠" onClick={() => window.desktopPet.hide()}>
            −
          </button>
          <button type="button" aria-label="关闭程序" title="关闭程序" onClick={() => window.desktopPet.close()}>
            ×
          </button>
        </div>

        <div
          className={`pet-illustration pet-state-${petState} no-drag`}
          aria-label="点击桌宠互动"
          role="button"
          tabIndex={0}
          onClick={handlePetClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              handlePetClick()
            }
          }}
        >
          <img className="pet-photo" src={petImage} alt="桌宠" draggable={false} />
        </div>

        <p className="pet-name">小兽正在醒来</p>
        <p className="pet-state">{stateText}</p>
        <p className="pet-status">{platform}</p>
        <p className="drag-hint">拖动卡片移动窗口 · 点击角色互动</p>
      </section>
    </main>
  )
}

export default App
