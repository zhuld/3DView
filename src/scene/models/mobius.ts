import * as THREE from 'three';
import type { PresetDefinition } from './types';

/**
 * 莫比乌斯环（Möbius strip）。
 *
 * 用参数方程生成带宽为 2·halfWidth 的带状曲面：
 * 沿 u 方向绕行一周的同时曲面翻转 180°（v·sin(u/2) 提供 z 位移），
 * 因此它只有一个面、一条边界，必须双面渲染才能看到完整形态。
 */
export const mobius: PresetDefinition = {
  color: 0x6ee7b7,
  material: { side: THREE.DoubleSide },
  build: () => {
    const radius = 0.68; // 中心圆半径
    const halfWidth = 0.12; // 带宽的一半
    const uSegments = 240;
    const vSegments = 8;

    const positions: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= uSegments; i++) {
      const u = (i / uSegments) * Math.PI * 2;
      const cosHalf = Math.cos(u / 2);
      const sinHalf = Math.sin(u / 2);

      for (let j = 0; j <= vSegments; j++) {
        const v = (j / vSegments - 0.5) * 2 * halfWidth;
        const r = radius + v * cosHalf;
        positions.push(r * Math.cos(u), r * Math.sin(u), v * sinHalf);
      }
    }

    for (let i = 0; i < uSegments; i++) {
      for (let j = 0; j < vSegments; j++) {
        const a = i * (vSegments + 1) + j;
        const b = a + 1;
        const c = a + (vSegments + 1);
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    // 默认平躺在 XY 平面正对观察者，倾斜后半个扭转更容易被看出来。
    geometry.rotateX(-1.05);
    geometry.rotateY(0.35);
    return geometry;
  },
};
