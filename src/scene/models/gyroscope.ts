import * as THREE from 'three';
import { createMetalMaterial } from './materials';
import type { PresetDefinition } from './types';

let yawRing: THREE.Object3D | null = null;
let pitchRing: THREE.Object3D | null = null;
let rollRing: THREE.Object3D | null = null;

/**
 * 陀螺仪（Gyroscope）。
 *
 * 三层套环分别固定在三个逐级嵌套的组上，各自绕不同轴以不同速度旋转，
 * 形成经典万向节结构；中心是带棱面的核心球体，下方有一只小支架。
 */
export const gyroscope: PresetDefinition = {
  color: 0xfbbf24,
  build: () => {
    const group = new THREE.Group();
    group.rotation.set(0.22, -0.32, 0);

    const outerMaterial = createMetalMaterial(0xfbbf24, { roughness: 0.2 });
    const middleMaterial = createMetalMaterial(0x38bdf8, { roughness: 0.22 });
    const innerMaterial = createMetalMaterial(0xf472b6, { roughness: 0.24 });
    const coreMaterial = createMetalMaterial(0xe2e8f0, { roughness: 0.16 });
    const standMaterial = createMetalMaterial(0x64748b, { roughness: 0.5 });

    // 外层环：竖直摆放，绕竖直轴偏航旋转。
    const yaw = new THREE.Group();
    yaw.add(new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.028, 14, 96), outerMaterial));
    group.add(yaw);

    // 中层环：初始面朝 ZY 平面，绕 X 轴俯仰旋转。
    const pitch = new THREE.Group();
    const middleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.024, 14, 96),
      middleMaterial,
    );
    middleRing.rotation.y = Math.PI / 2;
    pitch.add(middleRing);
    yaw.add(pitch);

    // 内层环与核心：绕 Z 轴自旋，速度最快。
    const roll = new THREE.Group();
    roll.add(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.02, 12, 96), innerMaterial));
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), coreMaterial);
    roll.add(core);
    pitch.add(roll);

    // 底座：一圈托环加一根立柱，托住外环下缘。
    const base = new THREE.Group();
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.014, 10, 64), standMaterial);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = -0.8;
    base.add(baseRing);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 12), standMaterial);
    post.position.y = -0.75;
    base.add(post);
    group.add(base);

    yawRing = yaw;
    pitchRing = pitch;
    rollRing = roll;
    return group;
  },
  animate: (_root, time) => {
    if (yawRing) yawRing.rotation.y = time * 0.55;
    if (pitchRing) pitchRing.rotation.x = time * 0.9;
    if (rollRing) rollRing.rotation.z = time * 1.4;
  },
};
