import { useEffect, useRef } from 'react'
import { getPetImageUrl, loadPetAlphaMap, loadPetDisplaySize } from './modules/AssetManager'
import { usePetAction } from './modules/ActionModule'
import { usePetInteraction } from './modules/PetInteraction'
import { PetRenderer } from './modules/PetRenderer'

// App 只负责「组装」：把素材、动作、交互、渲染这几个模块接起来。

function App() {
  const stageRef = useRef<HTMLElement>(null)
  const alphaCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const { action, play, stop } = usePetAction()

  useEffect(() => {
    // 按素材尺寸设置窗口大小
    void loadPetDisplaySize()
      .then(({ width, height }) => window.desktopPet.setSize(width, height))
      .catch(() => {})

    // 建 alpha 图（点击穿透判定用）
    void loadPetAlphaMap()
      .then((canvas) => {
        alphaCanvasRef.current = canvas
      })
      .catch(() => {})
  }, [])

  const { onPointerDown, onPointerMove, onPointerUp } = usePetInteraction(
    stageRef,
    alphaCanvasRef,
    {
      onTap: () => play('happy'),
      onDragStart: () => {
        play('drag')
        window.desktopPet.dragStart()
      },
      onDragMove: () => window.desktopPet.dragMove(),
      onDragEnd: () => {
        stop()
        window.desktopPet.dragEnd()
      },
    },
  )

  return (
    <main
      className="pet-stage"
      ref={stageRef}
      aria-label="桌宠"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <PetRenderer imageUrl={getPetImageUrl()} action={action} />
    </main>
  )
}

export default App
