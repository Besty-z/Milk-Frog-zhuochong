import defendImg from '../assets/poses/defend.jpg'
import shyImg from '../assets/poses/shy.jpg'
import gazeImg from '../assets/poses/gaze.jpg'
import funnyImg from '../assets/poses/funny.png'
import sadImg from '../assets/poses/sad.jpg'

// PoseActions：默认奶蛙的「静态姿势动作」定义。
//
// 用户给的素材是 5 张独立静态图（不是连续动画帧），每张对应一个动作姿势：
//   防御.jpg → 防御、害羞.jpg → 害羞、凝视.jpg → 凝视、搞怪.png → 搞怪、伤心.jpg → 伤心。
// 每张图都是「已经摆好姿势」的完整素材，这里只登记基础信息（id/名字/图/动画类型），
// 触发方式、时长、速度、冷却等「配置」由 main 进程持久化（见 vite-env.d.ts 的 StaticActionConfig）。
//
// 原文件在项目根目录，这里复制进 assets/poses/ 交给 Vite 打包（名字换成 ASCII）。
// motion 字段对应 styles.css 里的 .pose-motion--* 动画。

export type PoseMotion = 'defend' | 'shy' | 'gaze' | 'funny' | 'sad'

export interface StaticPoseAction {
  /** 触发用的动作 id（也是配置持久化的 key）。 */
  id: string
  /** 动作中文名。 */
  label: string
  /** 姿势图（打包后的资源 URL）。 */
  imageUrl: string
  /** 叠加的位移动画类型。 */
  motion: PoseMotion
}

// 每个动作叠加位移动画的「基准时长」（毫秒），要和 styles.css 里 keyframes 的时长一致；
// 播放速度 speed 用「基准时长 / speed」来缩放 animation-duration。
export const MOTION_BASE_DURATION: Record<PoseMotion, number> = {
  defend: 400,
  shy: 1100,
  gaze: 1300,
  funny: 350,
  sad: 1100,
}

export const STATIC_POSE_ACTIONS: StaticPoseAction[] = [
  { id: 'pose-defend', label: '防御', imageUrl: defendImg, motion: 'defend' },
  { id: 'pose-shy', label: '害羞', imageUrl: shyImg, motion: 'shy' },
  { id: 'pose-gaze', label: '凝视', imageUrl: gazeImg, motion: 'gaze' },
  { id: 'pose-funny', label: '搞怪', imageUrl: funnyImg, motion: 'funny' },
  { id: 'pose-sad', label: '伤心', imageUrl: sadImg, motion: 'sad' },
]

// 默认配置：手动触发、已装备、2 秒、1 倍速、无冷却。
export const DEFAULT_ACTION_CONFIG: StaticActionConfig = {
  trigger: 'manual',
  equipped: true,
  durationMs: 2000,
  speed: 1,
  cooldownMs: 0,
}

// 合并后的完整动作：基础信息 + 用户配置。
export type StaticAction = StaticPoseAction & StaticActionConfig
