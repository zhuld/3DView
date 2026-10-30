import * as THREE from 'three';
import { createMetalMaterial } from './materials';
import type { PresetDefinition } from './types';

/** 递归层数：每层把四面体一分为四。 */
const DEPTH = 3;
/** 最外层四面体的外接球半径。 */
const BASE_RADIUS = 0.9;

// 正四面体四个顶点方向（正四面体外接球上的单位向量），几何体的四个子四面体沿这些方向偏移。
const DIRECTIONS = [
  new THREE.Vector3(1, 1, 1).normalize(),
  new THREE.Vector3(1, -1, -1).normalize(),
  new THREE.Vector3(-1, 1, -1).normalize(),
  new THREE.Vector3(-1, -1, 1).normalize(),
];

/**
 * 谢尔宾斯基四面体（Sierpinski Tetrahedron）。
 *
 * 每次迭代把四面体拆成四个半尺寸子四面体（保留顶点方向），
 * 递归 3 层后得到 64 个四面体。所有小块共享一份几何体，仅靠缩放定位，
 * 按叶子序号交替配色，整体缓慢自转。
 */
export const sierpinski: PresetDefinition = {
  color: 0xfbbf24,
  build: () => {
    const group = new THREE.Group();
    const geometry = new THREE.TetrahedronGeometry(1);
    const materials = [0xfbbf24, 0x38bdf8, 0xf472b6, 0xa78bfa].map((color) =>
      createMetalMaterial(color, { roughness: 0.28 }),
    );

    let leafIndex = 0;
    const grow = (center: THREE.Vector3, radius: number, depth: number): void => {
      if (depth === 0) {
        const mesh = new THREE.Mesh(geometry, materials[leafIndex % materials.length]);
        mesh.position.copy(center);
        mesh.scale.setScalar(radius);
        group.add(mesh);
        leafIndex += 1;
        return;
      }

      for (const direction of DIRECTIONS) {
        grow(center.clone().addScaledVector(direction, radius / 2), radius / 2, depth - 1);
      }
    };

    grow(new THREE.Vector3(), BASE_RADIUS, DEPTH);
    return group;
  },
  animate: (root, time) => {
    root.rotation.y = time * 0.24;
    root.rotation.x = Math.sin(time * 0.18) * 0.12;
  },
};
