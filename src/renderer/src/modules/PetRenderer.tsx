import type { PetAction } from './ActionModule'

// PetRenderer：按当前动作把角色画出来。每个动作对应一个 CSS 类，
// 动画细节写在 styles.css 里。以后加动作，就在 ACTION_CLASS 加一行 + styles.css 加动画。

interface PetRendererProps {
  imageUrl: string
  action: PetAction
}

const ACTION_CLASS: Partial<Record<PetAction, string>> = {
  happy: 'pet-photo--happy',
}

export function PetRenderer({ imageUrl, action }: PetRendererProps) {
  const extraClass = ACTION_CLASS[action] ?? ''

  return (
    <img
      className={`pet-photo${extraClass ? ` ${extraClass}` : ''}`}
      src={imageUrl}
      alt="桌宠"
      draggable={false}
    />
  )
}
