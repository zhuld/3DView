import * as THREE from 'three';
import type { PresetDefinition } from './types';

/**
 * 螺旋弹簧（Helix / Spring）。
 *
 * 使用 THREE.Curve 定义空间螺旋曲线，再用 TubeGeometry 包络成管状几何体，
 * 视觉上呈现交织的弹簧结构，比基础几何体更具复杂度。
 */
class HelixCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly radius = 0.45,
    private readonly height = 1.6,
    private readonly turns = 4
  ) {
    super();
  }

  override getPoint(t: number): THREE.Vector3 {
    const angle = t * Math.PI * 2 * this.turns;
    const x = this.radius * Math.cos(angle);
    const y = this.radius * Math.sin(angle);
    const z = (t - 0.5) * this.height;
    return new THREE.Vector3(x, y, z);
  }
}

export const helix: PresetDefinition = {
  color: 0x8ab6fd,
  build: () => {
    const curve = new HelixCurve(0.45, 1.6, 4);
    const geometry = new THREE.TubeGeometry(curve, 200, 0.045, 16, false);
    return geometry;
  },
};
