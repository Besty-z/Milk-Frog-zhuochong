import { useEffect, useState } from 'react'

function App() {
  const [platform, setPlatform] = useState('正在连接本地应用层...')

  useEffect(() => {
    void window.desktopPet.getSystemInfo().then((systemInfo) => {
      setPlatform(`运行于 ${systemInfo.platform}`)
    })
  }, [])

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

        <div className="pet-illustration" aria-hidden="true">
          <div className="pet-ear pet-ear-left" />
          <div className="pet-ear pet-ear-right" />
          <div className="pet-face">
            <span className="pet-eye pet-eye-left" />
            <span className="pet-eye pet-eye-right" />
            <span className="pet-mouth" />
          </div>
        </div>

        <p className="pet-name">小兽正在醒来</p>
        <p className="pet-status">{platform}</p>
        <p className="drag-hint">拖动角色移动窗口</p>
      </section>
    </main>
  )
}

export default App
