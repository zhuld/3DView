import * as THREE from 'three';
import type { HandLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { OneEuroFilter } from '../util/oneEuroFilter';
import type { ModelStage } from '../scene/modelStage';

/**
 * 捏合判定阈值（拇指尖与食指尖距离 / 掌宽）。
 * 低于该比例视为开始捏合。
 */
const PINCH_START = 0.32;
/** 迟滞阈值：捏合后只有比例回升到该值以上才判定为松开，避免临界抖动。 */
const PINCH_END = 0.48;
/** 手部短暂丢失的宽限时间（毫秒），期间保持捏合状态，避免旋转被打断。 */
const LOST_GRACE_MS = 250;

/**
 * 计算"捏合比例"：指尖距离除以掌宽。
 * 用掌宽做归一化，使判定不受手离镜头远近影响。
 * 缺关键点或掌宽过小时返回 1（即判定为未捏合）。
 */
function pinchRatio(landmarks: NormalizedLandmark[], aspect: number): number {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  if (!thumbTip || !indexTip || !wrist || !middleMcp) return 1;

  // 横纵距离按画面宽高比校正，否则非正方形画面会把距离算偏。
  const pinch = Math.hypot((indexTip.x - thumbTip.x) * aspect, indexTip.y - thumbTip.y);
  // 掌宽 = 腕部到中指根部的距离，作为尺度基准。
  const palm = Math.hypot((middleMcp.x - wrist.x) * aspect, middleMcp.y - wrist.y);
  return palm > 1e-4 ? pinch / palm : 1;
}

/**
 * 单手捏合 → 拖拽 → 旋转。
 *
 * 只有"食指尖射线命中模型"时捏合才算抓住模型，因此手在镜头前做其他动作
 * 不会误带动模型。横向拖拽绕世界 Y 轴偏航，纵向拖拽绕世界 X 轴俯仰。
 */
export class GestureRotator {
  enabled = true;
  sensitivity = 1;

  /** 当前是否处于捏合状态（按下）。 */
  pinching = false;
  /** 本次捏合是否真正抓住了模型；未抓住时拖拽不产生旋转。 */
  grabbedModel = false;
  /** 画面中是否检测到手。 */
  handVisible = false;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  // 指尖坐标抖动较大，用 1€ 滤波器平滑后再计算位移。
  private readonly filterX = new OneEuroFilter({ minCutoff: 2.4, beta: 0.12 });
  private readonly filterY = new OneEuroFilter({ minCutoff: 2.4, beta: 0.12 });
  private previousX = 0;
  private previousY = 0;
  private lastSeenAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly stage: ModelStage) {}

  /**
   * 每帧调用一次，更新手势状态并驱动模型旋转。
   * @param result 手部识别结果，null 表示本帧没有识别
   * @param camera 用于射线拾取的相机
   * @param timeMs 当前时间戳（毫秒）
   * @param aspect 视频画面的宽高比
   */
  update(
    result: HandLandmarkerResult | null,
    camera: THREE.Camera,
    timeMs: number,
    aspect: number,
  ): void {
    const landmarks = result?.landmarks?.[0];

    if (!landmarks) {
      // 短暂丢帧时维持捏合，避免旋转被瞬时打断。
      if (this.pinching && timeMs - this.lastSeenAt < LOST_GRACE_MS) return;
      this.handVisible = false;
      this.release();
      return;
    }

    this.handVisible = true;
    this.lastSeenAt = timeMs;

    if (!this.enabled) {
      this.release();
      return;
    }

    // 用滞回判断：按下用 PINCH_START，松开用 PINCH_END，防止阈值附近来回跳变。
    const ratio = pinchRatio(landmarks, aspect);
    const wantsPinch = this.pinching ? ratio < PINCH_END : ratio < PINCH_START;
    if (!wantsPinch) {
      this.release();
      return;
    }

    const tip = landmarks[8]!;
    // 镜像 x 轴，让屏幕上的光标方向与用户看到的镜像预览一致。
    const nx = 1 - 2 * this.filterX.filter(tip.x, timeMs);
    const ny = 1 - 2 * this.filterY.filter(tip.y, timeMs);

    if (!this.pinching) {
      // 捏合的第一帧只做拾取：射线命中模型才进入拖拽状态。
      this.pinching = true;
      this.previousX = nx;
      this.previousY = ny;
      this.ndc.set(nx, ny);
      this.raycaster.setFromCamera(this.ndc, camera);
      this.grabbedModel = this.stage.pickables.length > 0 &&
        this.raycaster.intersectObjects(this.stage.pickables, false).length > 0;
      return;
    }

    const deltaX = nx - this.previousX;
    const deltaY = ny - this.previousY;
    this.previousX = nx;
    this.previousY = ny;

    if (!this.grabbedModel) return;
    // 位移过小直接忽略，避免静止时把滤波残差累积成缓慢漂移。
    if (Math.abs(deltaX) < 1e-4 && Math.abs(deltaY) < 1e-4) return;

    // 归一化坐标映射到弧度：横向半屏 ≈ π，手感接近"抓住转动"。
    const scale = Math.PI * this.sensitivity;
    this.stage.rotateBy(deltaX * scale, -deltaY * scale);
  }

  /** 结束捏合：清空抓取状态并重置滤波器，下一轮捏合重新从零开始。 */
  release(): void {
    this.pinching = false;
    this.grabbedModel = false;
    this.filterX.reset();
    this.filterY.reset();
  }
}
