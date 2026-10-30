import * as THREE from 'three';
import type { PresetDefinition } from './types';

/**
 * 超公式曲面（Superformula Surface）。
 *
 * 在球面坐标系上应用超公式（超椭圆）半径函数，可生成星形、花瓣、
 * 尖刺等丰富多变的自然形态。通过手动构建 BufferGeometry，无需外部依赖。
 */
export const superformula: PresetDefinition = {
  color: 0xf6a8cf,
  build: () => {
    // 超公式参数：控制形状的花瓣数与尖锐程度
    const m = 12;   // 对称性 / 花瓣数
    const n1 = 0.6; // 整体圆润度
    const n2 = 0.8; // 长轴尖锐度
    const n3 = 0.8; // 短轴尖锐度
    const a = 1;
    const b = 1;

    const superformula2D = (phi: number) => {
      const t1 = Math.abs(Math.cos(m * phi / 4) / a);
      const t2 = Math.abs(Math.sin(m * phi / 4) / b);
      const r = Math.pow(Math.pow(t1, n2) + Math.pow(t2, n3), -1 / n1);
      return r;
    };

    const latSegments = 80;
    const lonSegments = 120;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    // 生成球面网格，每个顶点按超公式在经度方向变形半径
    for (let i = 0; i <= latSegments; i++) {
      const theta = (i / latSegments) * Math.PI; // 极角 [0, π]
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let j = 0; j <= lonSegments; j++) {
        const phi = (j / lonSegments) * Math.PI * 2; // 方位角 [0, 2π]
        const r = superformula2D(phi) * 0.85;

        const x = r * sinTheta * Math.cos(phi);
        const y = r * cosTheta;
        const z = r * sinTheta * Math.sin(phi);

        positions.push(x, y, z);

        // 近似法线：使用归一化的位置向量（球心到表面），对超公式变形足够平滑
        const len = Math.sqrt(x * x + y * y + z * z) || 1;
        normals.push(x / len, y / len, z / len);
      }
    }

    for (let i = 0; i < latSegments; i++) {
      for (let j = 0; j < lonSegments; j++) {
        const a = i * (lonSegments + 1) + j;
        const b = a + 1;
        const c = a + (lonSegments + 1);
        const d = c + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    return geometry;
  },
};
