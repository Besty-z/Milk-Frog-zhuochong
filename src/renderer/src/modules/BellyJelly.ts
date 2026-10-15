// BellyJelly：给静态桌宠加「肚子果冻晃动」。
//
// 原理分两层：
// 1) 弹簧-阻尼模拟肚子中心的上下位移（一个标量 o + 速度 v），点击给初速度、拖动喂速度，
//    松手后自然衰减，不会突变也不会无限抖。
// 2) 把位移当成「行波」只作用在肚子这一条横向区域：逐行采样原图、按位移取源行重画，
//    肚子两端用余弦包络平滑降到 0 —— 所以头、腿不动，也没有接缝。轻量、无第三方物理引擎。

export interface BellyRegion {
  // 肚子区域：以图片高度为 1 的比例区间 [0,1]。0 = 图片顶部，1 = 图片底部。
  // 想挪肚子位置 / 改大小，就调这两个数。
  top: number
  bottom: number
}

export interface BellyJellyConfig {
  region: BellyRegion
  /** 弹簧刚度：越大回弹越快、越「弹」。 */
  stiffness: number
  /** 阻尼：越大越快停；太小会一直抖不停。 */
  damping: number
  /** 点击时给肚子的初速度（图片高度/秒），越大弹得越高。 */
  pokeVelocity: number
  /** 松开拖动时补的一下，保证松手后还会再晃几下。 */
  releaseVelocity: number
  /** 拖动速度 → 肚子速度的耦合系数：越大越跟手、拖得越快晃得越猛。 */
  dragCoupling: number
  /** 肚子最大位移（图片高度比例），防越界。 */
  maxAmplitude: number
  /** 速度上限（图片高度/秒）。 */
  maxVelocity: number
}

// 默认值：肚子取图片中下段（站姿角色的肚子一般在这里），弹簧参数是「Q 弹、约晃 3~4 下」的手感。
// 幅度压得很小（最大位移约 6%、点击初速度只到约 3%）：肚子轻微弹一下，避免「拉长」角色的身材。
export const DEFAULT_CONFIG: BellyJellyConfig = {
  region: { top: 0.35, bottom: 0.75 },
  stiffness: 160,
  damping: 10,
  pokeVelocity: 0.4,
  releaseVelocity: 0.1,
  dragCoupling: 0.15,
  maxAmplitude: 0.06,
  maxVelocity: 1.0,
}

export class BellyJelly {
  // o：当前位移（图片高度比例，正 = 向下）；v：速度（图片高度/秒）
  private o = 0
  private v = 0

  constructor(private readonly cfg: BellyJellyConfig) {}

  /** 点击：给肚子一个向下的初速度，之后自然回弹。 */
  poke(): void {
    this.v += this.cfg.pokeVelocity
  }

  /** 拖动：把身体的垂直速度（图片高度/秒）按耦合系数喂给肚子，制造滞后。 */
  applyDragVelocity(vyFractionPerSecond: number): void {
    this.v += vyFractionPerSecond * this.cfg.dragCoupling
  }

  /** 松手：补一下，保证松手后还会上下晃几下再停。 */
  endDrag(): void {
    this.v += this.cfg.releaseVelocity
  }

  /** 推进一步弹簧-阻尼，返回当前位移（供渲染用）。 */
  update(dt: number): number {
    const { stiffness, damping, maxAmplitude, maxVelocity } = this.cfg
    const acceleration = -stiffness * this.o - damping * this.v

    // 半隐式欧拉：先更新速度，再更新位移，比显式更稳、不易发散
    this.v += acceleration * dt
    this.o += this.v * dt

    if (this.v > maxVelocity) this.v = maxVelocity
    else if (this.v < -maxVelocity) this.v = -maxVelocity
    if (this.o > maxAmplitude) this.o = maxAmplitude
    else if (this.o < -maxAmplitude) this.o = -maxAmplitude

    return this.o
  }
}

// 把原图逐行画到画布上：肚子区域每一行按「位移 × 包络」上下偏移取源行。
// 包络是余弦凸起，在肚子上下边缘平滑降为 0，所以头和腿保持原位、边缘无接缝。
export function drawBellyJelly(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  drawWidth: number,
  drawHeight: number,
  offset: number,
  region: BellyRegion,
): void {
  const W = image.naturalWidth
  const H = image.naturalHeight
  const span = region.bottom - region.top

  ctx.clearRect(0, 0, drawWidth, drawHeight)

  for (let y = 0; y < drawHeight; y++) {
    const t = y / drawHeight // 目标行在整图里的比例位置
    const u = (t - region.top) / span
    // 只在肚子区间内有包络，两端平滑降到 0
    const envelope = u >= 0 && u <= 1 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * u) : 0
    const dyNorm = offset * envelope

    let srcNorm = t - dyNorm
    if (srcNorm < 0) srcNorm = 0
    else if (srcNorm > 1) srcNorm = 1

    const srcY = Math.min(srcNorm * H, H - 1)
    ctx.drawImage(image, 0, srcY, W, 1, 0, y, drawWidth, 1)
  }
}
