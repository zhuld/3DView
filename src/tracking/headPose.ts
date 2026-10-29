import type { FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { OneEuroFilter } from '../util/oneEuroFilter';

export interface HeadSample {
  /** 水平偏移，约 -1..1，正值表示观看者向右移动。 */
  x: number;
  /** 垂直偏移，正值表示观看者向上移动。 */
  y: number;
  /** 深度比：头部处于中性距离时为 1，远离 >1，靠近 <1。 */
  depthRatio: number;
}

/** 左右眼外眼角的关键点索引（MediaPipe FaceMesh）。 */
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;

/** 自动校准所需的采样帧数。 */
const AUTO_CALIBRATION_FRAMES = 20;
/** 手动校准的持续时间（毫秒）。 */
const CALIBRATION_MS = 700;
/** 丢失人脸后的宽限时间（毫秒），避免瞬间丢帧就回中。 */
const LOST_GRACE_MS = 250;
/** 连续丢失超过该时间后重置滤波器，等人脸回来时重新收敛。 */
const FILTER_RESET_MS = 900;
/** 失去人脸后回中的时间常数（秒），越小回中越快。 */
const RECENTER_SECONDS = 0.35;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** 取中位数，用于校准：比平均值更能抵抗个别异常帧的影响。 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

interface EyeReading {
  x: number;
  y: number;
  /** 双眼间距（像素），用于估算远近。 */
  ipd: number;
}

/**
 * 把面部关键点换算成"相对于观看者的眼位"。
 *
 * 屏幕坐标取左右眼外眼角的中点，再减去校准得到的基准姿态；
 * 深度由双眼间距的视觉大小推断（凑近变大、后退变小）。
 *
 * x / y 轴做了镜像：摄像头正对观看者，人向右移动时关键点 x 反而变小，
 * 取反后才符合"窗户外看世界"的自然视差方向。
 */
export class HeadPoseEstimator {
  readonly sample: HeadSample = { x: 0, y: 0, depthRatio: 1 };
  /** 是否已完成校准；未校准时只收集基准数据，不输出偏移。 */
  calibrated = false;
  /** 最近一帧是否检测到人脸。 */
  tracking = false;

  // 三路信号分别滤波：x / y 用较低截止频率保证稳定，深度变化更慢、允许更平滑。
  private readonly filterX = new OneEuroFilter({ minCutoff: 1.2, beta: 0.06 });
  private readonly filterY = new OneEuroFilter({ minCutoff: 1.2, beta: 0.06 });
  private readonly filterDepth = new OneEuroFilter({ minCutoff: 1.5, beta: 0.02 });

  /** 校准得到的基准姿态，后续偏移都相对它计算。 */
  private neutralX = 0;
  private neutralY = 0;
  private neutralIpd = 0;

  private calibrationSamples: EyeReading[] = [];
  private calibrating = false;
  private calibrateDeadline = 0;

  private lastSeenAt = Number.NEGATIVE_INFINITY;
  private lastUpdateAt = 0;
  /** 长时间丢失人脸后置位，等下一次检测到人脸时重置滤波器。 */
  private filtersStale = false;

  /** 每帧调用一次，把检测结果更新为平滑后的眼位采样。 */
  update(
    result: FaceLandmarkerResult | null,
    videoWidth: number,
    videoHeight: number,
    timeMs: number,
  ): void {
    // 限制 dt 上限，防止页面切回前台时一次跳变过大导致画面突跳。
    const dt = Math.min(Math.max((timeMs - this.lastUpdateAt) / 1000, 0), 0.2);
    this.lastUpdateAt = timeMs;

    const landmarks = result?.faceLandmarks?.[0];

    if (!landmarks) {
      this.tracking = false;
      if (timeMs - this.lastSeenAt > FILTER_RESET_MS) this.filtersStale = true;
      // 短暂丢失先保持不动，超过宽限时间才平滑回中。
      if (timeMs - this.lastSeenAt > LOST_GRACE_MS) this.recenter(dt);
      return;
    }

    this.tracking = true;
    this.lastSeenAt = timeMs;

    if (this.filtersStale) {
      this.resetFilters();
      this.filtersStale = false;
    }

    const reading = this.readEyes(landmarks, videoWidth, videoHeight);
    if (!reading) return;

    if (!this.calibrated) {
      // 校准期间只累积样本：手动校准按时长结束，自动校准按帧数结束。
      this.calibrationSamples.push(reading);
      const ready = this.calibrating
        ? timeMs >= this.calibrateDeadline
        : this.calibrationSamples.length >= AUTO_CALIBRATION_FRAMES;
      if (ready) this.commitCalibration(timeMs);
      else this.recenter(dt);
      return;
    }

    const depth = clamp(this.neutralIpd / reading.ipd, 0.8, 1.25);
    // 真实头部移动对双眼间距的影响，比原始比值看起来要小：
    // 虚拟物体比真实物体更贴近眼睛，所以只取一半响应，保留深度线索又不至于"忽远忽近"。
    const softenedDepth = 1 + (depth - 1) * 0.5;

    this.sample.x = this.filterX.filter(reading.x - this.neutralX, timeMs);
    this.sample.y = this.filterY.filter(reading.y - this.neutralY, timeMs);
    this.sample.depthRatio = this.filterDepth.filter(softenedDepth, timeMs);
  }

  /** 开始一次定时校准，持续 CALIBRATION_MS，之后取样本中位数作为基准。 */
  beginCalibration(timeMs: number): void {
    this.calibrated = false;
    this.calibrating = true;
    this.calibrateDeadline = timeMs + CALIBRATION_MS;
    this.calibrationSamples = [];
  }

  /** 完全复位：清空校准结果与所有滤波状态。 */
  reset(): void {
    this.calibrated = false;
    this.calibrating = false;
    this.calibrationSamples = [];
    this.neutralX = 0;
    this.neutralY = 0;
    this.neutralIpd = 0;
    this.sample.x = 0;
    this.sample.y = 0;
    this.sample.depthRatio = 1;
    this.resetFilters();
  }

  /** 用累积样本的中位数确定中性姿态，并以"零偏移 / 深度 1"重新起步。 */
  private commitCalibration(timeMs: number): void {
    const samples = this.calibrationSamples;
    this.calibrationSamples = [];
    if (samples.length === 0) return;

    this.neutralX = median(samples.map((s) => s.x));
    this.neutralY = median(samples.map((s) => s.y));
    this.neutralIpd = median(samples.map((s) => s.ipd));
    this.calibrated = true;
    this.calibrating = false;

    // 校准完成后必须清空滤波器历史，否则会从旧的滤波值缓慢爬向 0。
    this.resetFilters();
    this.sample.x = this.filterX.filter(0, timeMs);
    this.sample.y = this.filterY.filter(0, timeMs);
    this.sample.depthRatio = this.filterDepth.filter(1, timeMs);
  }

  /**
   * 从关键点读取眼位与双眼间距。
   * 归一化坐标先转成像素再算距离，因此结果与视频分辨率无关。
   */
  private readEyes(
    landmarks: NormalizedLandmark[],
    videoWidth: number,
    videoHeight: number,
  ): EyeReading | null {
    const left = landmarks[LEFT_EYE_OUTER];
    const right = landmarks[RIGHT_EYE_OUTER];
    if (!left || !right) return null;

    const ipd = Math.hypot((right.x - left.x) * videoWidth, (right.y - left.y) * videoHeight);
    // 距离过小说明关键点异常（如侧脸、遮挡），本帧直接丢弃。
    if (ipd < 4) return null;

    const midX = (left.x + right.x) / 2;
    const midY = (left.y + right.y) / 2;

    // 归一化坐标 0..1 映射到 -1..1 后取反，完成镜像处理。
    return {
      x: -(midX * 2 - 1),
      y: -(midY * 2 - 1),
      ipd,
    };
  }

  /** 指数衰减回中：每帧按 dt 平滑地把偏移量拉回 0、深度拉回 1。 */
  private recenter(dt: number): void {
    const k = 1 - Math.exp(-dt / RECENTER_SECONDS);
    this.sample.x += -this.sample.x * k;
    this.sample.y += -this.sample.y * k;
    this.sample.depthRatio += (1 - this.sample.depthRatio) * k;
  }

  private resetFilters(): void {
    this.filterX.reset();
    this.filterY.reset();
    this.filterDepth.reset();
  }
}
