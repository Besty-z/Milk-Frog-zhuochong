// Spin：桌宠「360° 高速连续旋转」动作的计时逻辑。
//
// 两件事：
// 1) 角度曲线：前 85% 匀速、后 15% 三次缓出减速到 0（速度在分界处连续），
//    总角度 = 360° × 整数圈，所以结束时正好回到 0°、无偏移。
// 2) 缩放包络：开头快速 1 → fit、中间保持、末段随缓停回到 1。
//    fit = min(w,h)/对角线，保证旋转过程中角色不会超出窗口被裁掉；结束不残留缩放。

export interface SpinConfig {
  /** 总时长（毫秒），默认 5 秒。 */
  durationMs: number
  /** 旋转圈数，必须是整数（结束才正好回到 0°）。 */
  turns: number
}

export const DEFAULT_SPIN: SpinConfig = {
  durationMs: 5000,
  turns: 6,
}

export interface SpinFrame {
  /** 当前角度（度）。 */
  angle: number
  /** 当前缩放（1 = 原大小）。 */
  scale: number
  /** 是否已结束。 */
  done: boolean
}

const LINEAR_END = 0.85 // 前 85% 匀速，后 15% 缓停
const RAMP = 0.15 // 开头 15% 快速收到 fit 比例

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

// 缩放包络：开头 1 → fit，中间保持，末段随缓停回到 1。
function scaleAt(p: number, fit: number): number {
  if (p <= RAMP) {
    return 1 + (fit - 1) * smoothstep(p / RAMP)
  }
  if (p <= LINEAR_END) {
    return fit
  }
  const t = (p - LINEAR_END) / (1 - LINEAR_END)
  return fit + (1 - fit) * smoothstep(t)
}

export class SpinController {
  private startTime = 0
  private running = false
  private fitScale = 1

  constructor(private readonly cfg: SpinConfig = DEFAULT_SPIN) {}

  /** 传入角色显示宽高，用来算「旋转时不超出窗口」的缩放比例。 */
  start(nowMs: number, width: number, height: number): void {
    this.startTime = nowMs
    this.running = true
    const d = Math.sqrt(width * width + height * height)
    this.fitScale = d > 0 ? Math.min(width, height) / d : 1
  }

  get isRunning(): boolean {
    return this.running
  }

  frameAt(nowMs: number): SpinFrame {
    if (!this.running) {
      return { angle: 0, scale: 1, done: true }
    }

    const p = Math.min((nowMs - this.startTime) / this.cfg.durationMs, 1)
    const total = 360 * this.cfg.turns

    // 匀速段覆盖大部分角度；末段三次缓出，速度在分界处连续、到终点为 0。
    const linearAngle = (3 * LINEAR_END * total) / (1 + 2 * LINEAR_END)

    let angle: number
    if (p <= LINEAR_END) {
      angle = (p / LINEAR_END) * linearAngle
    } else {
      const s = (p - LINEAR_END) / (1 - LINEAR_END)
      angle = linearAngle + (total - linearAngle) * (1 - Math.pow(1 - s, 3))
    }

    if (p >= 1) {
      this.running = false
      return { angle: 0, scale: 1, done: true }
    }

    return { angle, scale: scaleAt(p, this.fitScale), done: false }
  }
}
