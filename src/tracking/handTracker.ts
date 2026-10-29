import { HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { assetUrl, loadVisionFileset, MonotonicClock } from './visionRuntime';
import type { Delegate } from './faceTracker';

/** MediaPipe HandLandmarker 的轻量封装，工作模式为 VIDEO（仅识别一只手）。 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private readonly clock = new MonotonicClock();
  /** 实际使用的推理后端，init() 完成后才有值。 */
  backend: Delegate | null = null;
  lastResult: HandLandmarkerResult | null = null;

  /** 初始化识别器；优先使用 GPU，失败时自动回退到 CPU。 */
  async init(): Promise<Delegate> {
    const fileset = await loadVisionFileset();
    const modelAssetPath = assetUrl('models/hand_landmarker.task');
    const options = {
      baseOptions: { modelAssetPath, delegate: 'GPU' as Delegate },
      runningMode: 'VIDEO' as const,
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options);
      this.backend = 'GPU';
    } catch (gpuError) {
      console.warn('[hand] GPU delegate unavailable, falling back to CPU', gpuError);
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath, delegate: 'CPU' },
      });
      this.backend = 'CPU';
    }

    return this.backend;
  }

  /** 对当前视频帧做一次检测；视频尚未就绪或检测异常时返回 null。 */
  detect(video: HTMLVideoElement, timeMs: number): HandLandmarkerResult | null {
    if (!this.landmarker || video.readyState < 2) return null;
    try {
      // MediaPipe 的 VIDEO 模式要求时间戳严格递增，这里统一做单调处理。
      this.lastResult = this.landmarker.detectForVideo(video, this.clock.next(timeMs));
      return this.lastResult;
    } catch (error) {
      console.warn('[hand] detection failed', error);
      return null;
    }
  }

  /** 释放底层模型资源。 */
  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.backend = null;
    this.lastResult = null;
  }
}
