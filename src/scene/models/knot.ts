import * as THREE from 'three';
import type { PresetDefinition } from './types';

/**
 * 复杂空间纽结（Complex Knot）。
 *
 * 使用 (p, q) 托鲁斯纽结参数方程定义曲线，再用 TubeGeometry 包络。
 * 默认使用 (3, 4) 纽结，比内置环面纽结的 (2, 3) 更为复杂交织。
 */
class TorusKnotCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly p = 3,
    private readonly q = 4,
    private readonly R = 0.7,
    private readonly r = 0.18
  ) {
    super();
  }

  override getPoint(t: number): THREE.Vector3 {
    const pt = t * Math.PI * 2 * this.p;
    const qt = t * Math.PI * 2 * this.q;
    const x = (this.R + this.r * Math.cos(qt)) * Math.cos(pt);
    const y = (this.R + this.r * Math.cos(qt)) * Math.sin(pt);
    const z = this.r * Math.sin(qt);
    return new THREE.Vector3(x, y, z);
  }
}

export const knot: PresetDefinition = {
  color: 0xfbd15b,
  build: () => {
    const curve = new TorusKnotCurve(3, 4, 0.7, 0.18);
    const geometry = new THREE.TubeGeometry(curve, 200, 0.05, 20, true);
    return geometry;
  },
};
