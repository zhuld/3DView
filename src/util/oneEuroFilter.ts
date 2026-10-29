export interface OneEuroOptions {
  /** 基础截止频率（Hz）。数值越小越平滑，但跟随延迟越大。 */
  minCutoff?: number;
  /** 速度系数。数值越大，快速运动时的延迟越小。 */
  beta?: number;
  /** 对导数（速度）做滤波时使用的截止频率。 */
  dCutoff?: number;
}

/**
 * 计算一阶低通滤波器的插值系数 alpha。
 * 由截止频率 cutoff 推出时间常数 tau，再按帧间隔 dt 归一化，
 * 使滤波强度只与真实时间相关，而不受帧率影响。
 */
function smoothingAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/**
 * 1€ 滤波器（Casiez 等，2012）。
 *
 * 思路是"用速度决定平滑程度"：静止或慢速时使用较低的截止频率，把抖动滤掉；
 * 快速移动时按速度提高截止频率，让结果紧跟输入。因为按时间而不是按帧计算，
 * 所以与帧率无关，适合处理头姿、手势这类实时信号。
 */
export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;

  /** 上一次的滤波输出，null 表示尚未初始化。 */
  private xPrev: number | null = null;
  /** 上一次的滤波后速度估计。 */
  private dxPrev = 0;
  /** 上一次输入的时间戳（毫秒）。 */
  private tPrev = 0;

  constructor(options: OneEuroOptions = {}) {
    this.minCutoff = options.minCutoff ?? 1;
    this.beta = options.beta ?? 0;
    this.dCutoff = options.dCutoff ?? 1;
  }

  /** 清空历史状态。信号中断或重新校准时调用，避免用旧数据继续插值。 */
  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  }

  /**
   * 送入一帧原始数据。
   * @param value 待滤波的值
   * @param timeMs 该帧的时间戳（毫秒）
   * @returns 滤波后的值
   */
  filter(value: number, timeMs: number): number {
    // 第一帧没有历史数据可参考，直接原样输出并初始化状态。
    if (this.xPrev === null) {
      this.xPrev = value;
      this.tPrev = timeMs;
      return value;
    }

    // dt 下限取 1ms，防止时间戳相同或回退时出现除零和数值爆炸。
    const dt = Math.max((timeMs - this.tPrev) / 1000, 1e-3);
    this.tPrev = timeMs;

    // 先用原始输入估算速度，再对速度本身低通，得到较稳的 dxHat。
    const dx = (value - this.xPrev) / dt;
    const dxHat = this.dxPrev + smoothingAlpha(this.dCutoff, dt) * (dx - this.dxPrev);
    this.dxPrev = dxHat;

    // 核心自适应项：速度越快，截止频率越高（越跟手）；越慢则越低（越平滑）。
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    this.xPrev += smoothingAlpha(cutoff, dt) * (value - this.xPrev);
    return this.xPrev;
  }
}
