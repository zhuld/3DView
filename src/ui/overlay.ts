import type { FaceLandmarkerResult, HandLandmarkerResult } from '@mediapipe/tasks-vision';

/** 手部骨架连接关系：每一对父子关键点索引。 */
const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const FACE_COLOR = 'rgba(125, 211, 252, 0.85)';
const HAND_COLOR = '#5eead4';
const PINCH_COLOR = '#fbbf24';

/** 镜像显示摄像头画面，并叠加面部 / 手部关键点。 */
export class PreviewOverlay {
  showLandmarks = true;

  private readonly context: CanvasRenderingContext2D | null;
  private video: HTMLVideoElement | null = null;
  private face: FaceLandmarkerResult | null = null;
  private hand: HandLandmarkerResult | null = null;
  private pinching = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly card: HTMLElement,
  ) {
    this.context = canvas.getContext('2d');
  }

  /** 绑定视频源并显示预览卡片。 */
  attachVideo(video: HTMLVideoElement): void {
    this.video = video;
    this.card.hidden = false;
  }

  /** 解绑视频源、隐藏预览卡片并清空画布。 */
  detachVideo(): void {
    this.video = null;
    this.face = null;
    this.hand = null;
    this.card.hidden = true;
    this.context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setFace(result: FaceLandmarkerResult | null): void {
    this.face = result;
  }

  setHand(result: HandLandmarkerResult | null): void {
    this.hand = result;
  }

  /** 是否处于"已抓住模型"的捏合状态，用于高亮提示。 */
  setPinching(active: boolean): void {
    this.pinching = active;
  }

  /** 每帧重绘预览画面与关键点。 */
  draw(): void {
    const ctx = this.context;
    const video = this.video;
    if (!ctx) return;

    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    if (!video || video.readyState < 2) return;

    // 水平翻转后绘制，让预览像镜子一样符合用户直觉。
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    if (this.showLandmarks) {
      ctx.fillStyle = FACE_COLOR;
      const face = this.face?.faceLandmarks?.[0];
      if (face) {
        // 每隔一个点采样一次，既省性能又足以看出轮廓。
        for (let i = 0; i < face.length; i += 2) {
          const point = face[i]!;
          ctx.fillRect((1 - point.x) * width - 0.6, point.y * height - 0.6, 1.2, 1.2);
        }
      }

      const hand = this.hand?.landmarks?.[0];
      if (hand) this.drawHand(ctx, hand, width, height);
    }
  }

  /** 绘制手部骨架、关键点，以及捏合位置的高亮圆环。 */
  private drawHand(
    ctx: CanvasRenderingContext2D,
    landmarks: NonNullable<HandLandmarkerResult['landmarks']>[number],
    width: number,
    height: number,
  ): void {
    ctx.strokeStyle = HAND_COLOR;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const [from, to] of HAND_CONNECTIONS) {
      const a = landmarks[from];
      const b = landmarks[to];
      if (!a || !b) continue;
      ctx.moveTo((1 - a.x) * width, a.y * height);
      ctx.lineTo((1 - b.x) * width, b.y * height);
    }
    ctx.stroke();

    ctx.fillStyle = HAND_COLOR;
    for (const point of landmarks) {
      ctx.beginPath();
      ctx.arc((1 - point.x) * width, point.y * height, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    const thumb = landmarks[4];
    const index = landmarks[8];
    if (this.pinching && thumb && index) {
      // 圆环画在拇指与食指中点，提示"已抓住模型"。
      const x = ((1 - thumb.x) + (1 - index.x)) * 0.5 * width;
      const y = ((thumb.y + index.y) * 0.5) * height;
      ctx.strokeStyle = PINCH_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
