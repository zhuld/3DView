import type { ModelStage } from '../scene/modelStage';

/**
 * 鼠标 / 触摸 / 滚轮回退方案：没有摄像头时仍可完整操作查看器。
 * 旋转复用与手势识别相同的入口（ModelStage.rotateBy），二者手感一致。
 */
export class PointerRotator {
  private dragging = false;
  private pointerId = -1;
  private lastX = 0;
  private lastY = 0;

  /**
   * @param canvas 绑定事件的画布
   * @param stage 目标模型舞台
   * @param getSensitivity 实时读取灵敏度（面板可随时调整）
   * @param onZoom 滚轮缩放回调，参数为滚动量 deltaY
   */
  constructor(
    private readonly canvas: HTMLElement,
    private readonly stage: ModelStage,
    private readonly getSensitivity: () => number,
    private readonly onZoom: (deltaY: number) => void,
  ) {
    canvas.addEventListener('pointerdown', this.handleDown);
    canvas.addEventListener('pointermove', this.handleMove);
    canvas.addEventListener('pointerup', this.handleUp);
    canvas.addEventListener('pointercancel', this.handleUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    // 屏蔽右键菜单，避免拖拽过程中弹出菜单打断操作。
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private readonly handleDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.dragging) return;
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.canvas.classList.add('dragging');
    // 捕获指针，指针移出画布后仍能收到 move/up 事件。
    this.canvas.setPointerCapture?.(event.pointerId);
  };

  private readonly handleMove = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.pointerId) return;
    const deltaX = event.clientX - this.lastX;
    const deltaY = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;

    const scale = 0.0085 * this.getSensitivity();
    // 屏幕像素位移换算成弧度，纵向取正号以匹配"向下拖 = 俯视"的直觉。
    this.stage.rotateBy(deltaX * scale, deltaY * scale);
  };

  private readonly handleUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = -1;
    this.canvas.classList.remove('dragging');
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    // 滚轮默认会滚动页面，这里必须阻止，缩放交给外部处理。
    event.preventDefault();
    this.onZoom(event.deltaY);
  };
}
