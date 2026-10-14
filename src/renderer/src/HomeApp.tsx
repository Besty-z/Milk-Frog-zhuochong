import { useCallback, useEffect, useState } from 'react'
import { getDefaultPetImage } from './modules/AssetManager'
import './home.css'

// HomeApp：桌宠「首页」。三个标签页：导入 / 动作 / 桌宠样式。
// 现在「导入」和「桌宠样式（图片库）」已打通；「动作」下一步做。

type Tab = 'import' | 'action' | 'style'

const TABS: { key: Tab; label: string }[] = [
  { key: 'import', label: '导入' },
  { key: 'action', label: '动作' },
  { key: 'style', label: '桌宠样式' },
]

const ACTIONS: { key: string; label: string; desc: string }[] = [
  { key: 'idle', label: '待机', desc: '停止当前动作，回到待机状态' },
  { key: 'happy', label: '开心', desc: '开心地跳两下' },
]

interface LibraryImage {
  id: string
  name: string
  dataUrl: string
}

interface PetLibrary {
  images: LibraryImage[]
  currentId: string | null
}

function HomeApp() {
  const [tab, setTab] = useState<Tab>('import')
  const [picked, setPicked] = useState<{ dataUrl: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [library, setLibrary] = useState<PetLibrary>({ images: [], currentId: null })

  const refreshLibrary = useCallback(() => {
    void window.desktopPet.getLibrary().then(setLibrary)
  }, [])

  useEffect(() => {
    refreshLibrary()
  }, [refreshLibrary])

  const handleChoose = async () => {
    setBusy(true)
    try {
      const image = await window.desktopPet.chooseImage()
      if (image) {
        setPicked(image)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleApply = () => {
    if (!picked) {
      return
    }

    window.desktopPet.applyImage(picked)
    setPicked(null)
    refreshLibrary()
  }

  const handleSelect = (id: string | null) => {
    window.desktopPet.selectImage(id)
    refreshLibrary()
  }

  const handleDelete = (id: string) => {
    window.desktopPet.deleteImage(id)
    refreshLibrary()
  }

  return (
    <div className="home">
      <nav className="home-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`home-tab${tab === t.key ? ' home-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="home-body">
        {tab === 'import' && (
          <section className="home-panel">
            <h2>导入图片</h2>
            <p className="home-hint">选一张图片，导入后它会进入「桌宠样式」，并自动设为当前桌宠。</p>

            <button className="home-btn" onClick={handleChoose} disabled={busy}>
              {busy ? '选择中…' : '选择图片'}
            </button>

            {picked && (
              <div className="home-preview">
                <img src={picked.dataUrl} alt={picked.name} />
                <p className="home-hint">{picked.name}</p>
                <button className="home-btn home-btn--primary" onClick={handleApply}>
                  导入并设为桌宠
                </button>
              </div>
            )}
          </section>
        )}

        {tab === 'action' && (
          <section className="home-panel">
            <h2>动作</h2>
            <p className="home-hint">点「预览」，桌面上的桌宠就会当场做这个动作。</p>

            <div className="home-action-list">
              {ACTIONS.map((a) => (
                <div key={a.key} className="home-action-item">
                  <div className="home-action-text">
                    <span className="home-action-label">{a.label}</span>
                    <span className="home-hint">{a.desc}</span>
                  </div>
                  <button className="home-btn" onClick={() => window.desktopPet.triggerAction(a.key)}>
                    预览
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'style' && (
          <section className="home-panel">
            <h2>桌宠样式</h2>
            <p className="home-hint">管理你导入过的图片，点一张就能让它变成当前桌宠。</p>

            {library.images.length === 0 ? (
              <p className="home-hint">还没有导入图片，去「导入」页加一张吧。</p>
            ) : (
              <div className="home-grid">
                <div
                  className={`home-card${library.currentId === null ? ' home-card--current' : ''}`}
                  onClick={() => handleSelect(null)}
                  role="button"
                >
                  <img src={getDefaultPetImage()} alt="默认桌宠" />
                  <span className="home-card-name">默认桌宠</span>
                  {library.currentId === null && <span className="home-card-badge">使用中</span>}
                </div>

                {library.images.map((img) => (
                  <div
                    key={img.id}
                    className={`home-card${library.currentId === img.id ? ' home-card--current' : ''}`}
                    onClick={() => handleSelect(img.id)}
                    role="button"
                  >
                    <img src={img.dataUrl} alt={img.name} />
                    <span className="home-card-name">{img.name}</span>
                    {library.currentId === img.id && <span className="home-card-badge">使用中</span>}
                    <button
                      className="home-card-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(img.id)
                      }}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default HomeApp
