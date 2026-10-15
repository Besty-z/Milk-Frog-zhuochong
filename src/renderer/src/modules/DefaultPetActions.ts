import laughVideoUrl from '../assets/laugh-video.mp4'

// DefaultPetActions：默认奶娃「自带」的动作视频（随应用打包，不用导入）。
// 捧腹大笑是默认桌宠的默认动作：点桌宠就播这段（带声音），播完自动回待机。
// dataUrl 这里存的是打包后的资源 URL（不是 dataURL），渲染层 <video>/canvas 都能直接吃。
export const BUILTIN_DEFAULT_VIDEO_ACTIONS: VideoActionDef[] = [
  { id: 'builtin-laugh', name: '捧腹大笑', dataUrl: laughVideoUrl, loop: false },
]

export function isBuiltinVideoAction(id: string): boolean {
  return BUILTIN_DEFAULT_VIDEO_ACTIONS.some((a) => a.id === id)
}
