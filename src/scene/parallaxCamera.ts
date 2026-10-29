import * as THREE from 'three';
import { clamp } from '../util/math';
import type { HeadSample } from '../tracking/headPose';

/** 头部偏移转化为相机位移时的衰减系数，让视差只在轻微范围内起作用。 */
const POSITIONAL_GAIN = 0.2;

/**
 * 离轴（"窗口"）投影相机。
 *
 * 虚拟屏幕固定在 z = 0 平面上，相机被放在用户眼位的估计值处，
 * 并用非对称视锥保证 z = 0 平面始终精确映射到整个视口——
 * 于是画面构图不变，但相机确实在移动，从而产生运动视差。
 * 相机自身的位移响应刻意做得很弱，主要的头部反馈靠模型旋转来表现。
 */
export class ParallaxCamera {
  readonly camera: THREE.PerspectiveCamera;

  /** 虚拟屏幕在 z = 0 平面上的半宽（世界单位）。 */
  screenHalfWidth = 1.15;
  /** 中性位姿下眼睛到屏幕平面的距离。 */
  baseDistance = 2.4;
  /** 头部偏移的缩放系数，设为 0 可关闭视差。 */
  gain = 1;

  private aspect = 16 / 9;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(50, this.aspect, 0.05, 60);
    this.camera.matrixAutoUpdate = true;
    this.reset();
  }

  setAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.aspect = aspect;
  }

  /** 根据最新一次头姿采样更新相机眼位。 */
  update(sample: HeadSample): void {
    const halfW = this.screenHalfWidth;
    const halfH = halfW / this.aspect;

    // 偏移量限制在屏幕尺寸的 90% 内，防止眼位跑到屏幕外侧导致透视翻转。
    const ex = clamp(
      sample.x * halfW * 0.85 * this.gain * POSITIONAL_GAIN,
      -halfW * 0.9,
      halfW * 0.9,
    );
    const ey = clamp(
      sample.y * halfH * 0.85 * this.gain * POSITIONAL_GAIN,
      -halfH * 0.9,
      halfH * 0.9,
    );
    // 前后移动按比例改变观看距离，并限幅在 0.5~2 倍之间。
    const depth = this.baseDistance * clamp(sample.depthRatio, 0.5, 2);

    this.applyEye(ex, ey, depth, halfW, halfH);
  }

  /** 回到中性位姿（眼位在屏幕中心正前方）。 */
  reset(): void {
    const halfH = this.screenHalfWidth / this.aspect;
    this.applyEye(0, 0, this.baseDistance, this.screenHalfWidth, halfH);
  }

  /**
   * 设置眼位并重建非对称投影矩阵。
   * 视锥左右 / 上下边界由"屏幕角点相对眼位的偏移"决定，
   * 因此无论眼位如何变化，z = 0 平面上的屏幕都填满视口。
   */
  private applyEye(ex: number, ey: number, depth: number, halfW: number, halfH: number): void {
    const camera = this.camera;
    camera.position.set(ex, ey, depth);
    camera.quaternion.identity();
    camera.updateMatrixWorld();

    const near = camera.near;
    // 相似三角形：把屏幕边界从 z = 0 投影到近裁剪面。
    const left = (near * (-halfW - ex)) / depth;
    const right = (near * (halfW - ex)) / depth;
    const top = (near * (halfH - ey)) / depth;
    const bottom = (near * (-halfH - ey)) / depth;

    camera.projectionMatrix.makePerspective(left, right, top, bottom, near, camera.far);
    // 手动改矩阵后必须同步逆矩阵，否则射线拾取与视锥计算会出错。
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
}
