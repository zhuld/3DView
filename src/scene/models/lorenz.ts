import * as THREE from 'three';
import type { PresetDefinition } from './types';

// 洛伦兹系统参数：经典混沌解。
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;
const STEP = 0.005;
const STEPS = 4000;
/** 丢弃起始的暂态段，只保留落在吸引子上的轨迹。 */
const SKIP = 300;
/** 每隔几个积分步取一个采样点，避免点数过多。 */
const SAMPLE_EVERY = 2;
/** 归一化后的最大边长。 */
const TARGET_SIZE = 1.4;

/**
 * 洛伦兹吸引子（Lorenz Attractor）。
 *
 * 数值积分经典的洛伦兹方程，把轨迹采样成空间点列后转换为 CatmullRom 曲线，
 * 再用 TubeGeometry 包络成一根细管——一条永不重复、不断翻面的混沌轨迹。
 */
export const lorenz: PresetDefinition = {
  color: 0x67e8f9,
  build: () => {
    const samples: THREE.Vector3[] = [];
    let x = 0.1;
    let y = 0;
    let z = 0;

    for (let i = 0; i < STEPS; i++) {
      const dx = SIGMA * (y - x);
      const dy = x * (RHO - z) - y;
      const dz = x * y - BETA * z;
      x += dx * STEP;
      y += dy * STEP;
      z += dz * STEP;
      if (i >= SKIP && (i - SKIP) % SAMPLE_EVERY === 0) {
        samples.push(new THREE.Vector3(x, y, z));
      }
    }

    const box = new THREE.Box3().setFromPoints(samples);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = TARGET_SIZE / Math.max(size.x, size.y, size.z);

    // 洛伦兹吸引子的"高度"原本在 z 轴，交换 y/z 让它竖直站立。
    const points = samples.map(
      (point) =>
        new THREE.Vector3(
          (point.x - center.x) * scale,
          (point.z - center.z) * scale,
          (point.y - center.y) * scale,
        ),
    );

    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    return new THREE.TubeGeometry(curve, 1500, 0.01, 8, false);
  },
};
