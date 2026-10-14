import { useEffect, useRef, useState } from 'react'
import { getDefaultPetImage, loadPetAlphaMap, loadPetDisplaySize } from './modules/AssetManager'
import { usePetAction } from './modules/ActionModule'
import { usePetInteraction } from './modules/PetInteraction'
import { PetRenderer } from './modules/PetRenderer'

// App 只负责「组装」：把素材、动作、交互、渲染这几个模块接起来。

function App() {
  const stageRef = useRef<HTMLElement>(null)
  const alphaCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [imageUrl, setImageUrl] = useState<string>(getDefaultPetImage)

  const { action, play, stop } = usePetAction()

  // 启动时问主进程：有没有已导入的图片，有就换上
  useEffect(() => {
    void window.desktopPet.getCurrentImage().then((dataUrl) => {
      if (dataUrl) {
        setImageUrl(dataUrl)
      }
    })
  }, [])

  // 主进程通知「换图」时，跟随更新（dataUrl 为 null 表示恢复默认图）
  useEffect(() => {
    return window.desktopPet.onPetImageChanged((dataUrl) => {
      setImageUrl(dataUrl ?? getDefaultPetImage())
    })
  }, [])

  // 首页「动作」页触发：让桌宠播放指定动作
  useEffect(() => {
    return window.desktopPet.onTriggerAction((action) => {
      if (action === 'happy') {
        play('happy')
      } else if (action === 'idle') {
        stop()
      }
    })
  }, [play, stop])

  // 图片变了：重新算窗口尺寸 + 重新建 alpha 图（点击穿透判定用）
  useEffect(() => {
    void loadPetDisplaySize(imageUrl)
      .then(({ width, height }) => window.desktopPet.setSize(width, height))
      .catch(() => {})

    void loadPetAlphaMap(imageUrl)
      .then((canvas) => {
        alphaCanvasRef.current = canvas
      })
      .catch(() => {})
  }, [imageUrl])

  const { onPointerDown, onPointerMove, onPointerUp } = usePetInteraction(
    stageRef,
    alphaCanvasRef,
    {
      onTap: () => play('happy'),
      onDragStart: (screenX, screenY) => {
        play('drag')
        window.desktopPet.dragStart(screenX, screenY)
      },
      onDragMove: (screenX, screenY) => window.desktopPet.dragMove(screenX, screenY),
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
      <PetRenderer imageUrl={imageUrl} action={action} />
    </main>
  )
}

export default App
