import { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { assetUrl, loadVisionFileset, MonotonicClock } from './visionRuntime';

export type Delegate = 'GPU' | 'CPU';

/**
 * MediaPipe FaceLandmarker 的轻量封装，工作模式为 VIDEO。
 * 输出 478 个人脸关键点以及面部变换矩阵，头姿估计器据此得到眼位与深度线索。
 */
export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private readonly clock = new MonotonicClock();

  /** 初始化识别器；优先使用 GPU，失败时自动回退到 CPU。 */
  async init(): Promise<Delegate> {
    const fileset = await loadVisionFileset();
    const modelAssetPath = assetUrl('models/face_landmarker.task');
    const options = {
      baseOptions: { modelAssetPath, delegate: 'GPU' as Delegate },
      runningMode: 'VIDEO' as const,
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      // 头姿估计需要面部变换矩阵来判断深度。
      outputFacialTransformationMatrixes: true,
    };

    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, options);
      return 'GPU';
    } catch (gpuError) {
      console.warn('[face] GPU delegate unavailable, falling back to CPU', gpuError);
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath, delegate: 'CPU' },
      });
      return 'CPU';
    }
  }

  /** 对当前视频帧做一次检测；视频尚未就绪或检测异常时返回 null。 */
  detect(video: HTMLVideoElement, timeMs: number): FaceLandmarkerResult | null {
    if (!this.landmarker || video.readyState < 2) return null;
    try {
      // MediaPipe 的 VIDEO 模式要求时间戳严格递增，这里统一做单调处理。
      return this.landmarker.detectForVideo(video, this.clock.next(timeMs));
    } catch (error) {
      console.warn('[face] detection failed', error);
      return null;
    }
  }

  /** 释放底层模型资源。 */
  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
