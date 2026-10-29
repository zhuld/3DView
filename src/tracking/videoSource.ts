/** 摄像头相关的错误类型，供界面映射成多语言提示。 */
export type VideoErrorCode = 'unsupported' | 'insecure' | 'denied' | 'notfound' | 'unknown';

export class VideoSourceError extends Error {
  readonly code: VideoErrorCode;

  constructor(code: VideoErrorCode, message: string) {
    super(message);
    this.name = 'VideoSourceError';
    this.code = code;
  }
}

type FrameCallback = (nowMs: number) => void;

/**
 * 负责管理摄像头的 <video> 元素，并按帧驱动回调。
 *
 * 优先使用 requestVideoFrameCallback（与摄像头帧同步，最省电）；
 * 不支持时退回 requestAnimationFrame 并限制到约 30fps。
 */
export class VideoSource {
  readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private callback: FrameCallback | null = null;
  private frameHandle = 0;
  private rafHandle = 0;
  private running = false;
  private lastFrameTime = 0;

  constructor(private readonly container: HTMLElement) {
    // 提前创建 <video>；只有真正拿到摄像头流后才插入 DOM。
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    this.video = video;
  }

  get width(): number {
    return this.video.videoWidth;
  }

  get height(): number {
    return this.video.videoHeight;
  }

  get active(): boolean {
    return this.running;
  }

  /** 请求摄像头并等待首帧元数据，失败时抛出带错误码的 VideoSourceError。 */
  async start(): Promise<void> {
    if (this.running) return;

    // 区分"浏览器不支持"和"页面不是安全上下文"，二者提示不同。
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new VideoSourceError(
        window.isSecureContext ? 'unsupported' : 'insecure',
        'MediaDevices API unavailable',
      );
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // 前置摄像头；分辨率与帧率给的是理想值，不满足也可接受。
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 60 },
        },
      });
    } catch (error) {
      // 把 DOMException 归类为界面可识别的错误码。
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new VideoSourceError('denied', 'Camera permission denied');
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        throw new VideoSourceError('notfound', 'No camera device found');
      }
      throw new VideoSourceError('unknown', error instanceof Error ? error.message : String(error));
    }

    this.video.srcObject = this.stream;
    if (!this.video.isConnected) this.container.appendChild(this.video);
    // 某些浏览器会拒绝自动播放，这里忽略错误，后续由元数据等待兜底。
    await this.video.play().catch(() => undefined);
    await this.waitForMetadata();
    this.running = true;
  }

  /** 停止采集并彻底释放摄像头（指示灯会熄灭）。 */
  stop(): void {
    this.stopLoop();
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.video.remove();
  }

  /** 设置逐帧回调，传 null 可取消。 */
  onFrame(callback: FrameCallback | null): void {
    this.callback = callback;
  }

  /** 启动逐帧循环（会先停掉已有循环，避免重复调度）。 */
  startLoop(): void {
    if (!this.callback) return;
    this.stopLoop();
    this.scheduleNext();
  }

  /** 停止逐帧循环。 */
  stopLoop(): void {
    if (this.frameHandle && 'cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.frameHandle);
    }
    this.frameHandle = 0;
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;
  }

  /** 等待视频尺寸就绪；超时说明流没有产出画面（例如设备被占用）。 */
  private waitForMetadata(): Promise<void> {
    if (this.video.readyState >= 1 && this.video.videoWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new VideoSourceError('notfound', 'Camera stream produced no frames'));
      }, 6000);
      this.video.addEventListener(
        'loadedmetadata',
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }

  /** 调度下一帧；两种实现都通过回调自身递归，形成持续的循环。 */
  private scheduleNext(): void {
    if (!this.callback) return;

    if ('requestVideoFrameCallback' in this.video) {
      this.frameHandle = this.video.requestVideoFrameCallback((now) => {
        this.frameHandle = 0;
        this.invoke(now);
        this.scheduleNext();
      });
      return;
    }

    // 回退方案：用 rAF 但限制到约 30fps，避免无谓的识别开销。
    this.rafHandle = requestAnimationFrame((now) => {
      this.rafHandle = 0;
      if (now - this.lastFrameTime >= 33) {
        this.lastFrameTime = now;
        this.invoke(now);
      }
      this.scheduleNext();
    });
  }

  /** 触发一次回调；单帧异常不应中断整个循环，因此只记录日志。 */
  private invoke(now: number): void {
    if (!this.callback || this.video.readyState < 2) return;
    try {
      this.callback(now);
    } catch (error) {
      console.error('[video] frame callback failed', error);
    }
  }
}
