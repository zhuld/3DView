import * as THREE from 'three';
import { createMetalMaterial } from './materials';
import type { PresetDefinition } from './types';

/** 车轮半径。 */
const WHEEL_RADIUS = 0.32;

// 关键点（侧视平面 XY，车轮正面朝 +Z）。
const REAR_AXLE = new THREE.Vector3(-0.52, 0, 0);
const FRONT_AXLE = new THREE.Vector3(0.52, 0, 0);
const BOTTOM_BRACKET = new THREE.Vector3(-0.06, -0.03, 0);
const SEAT_TOP = new THREE.Vector3(-0.2, 0.4, 0);
const HEAD_TOP = new THREE.Vector3(0.34, 0.36, 0);
const HEAD_BOTTOM = new THREE.Vector3(0.42, 0.25, 0);

let wheels: THREE.Group[] = [];
let crank: THREE.Group | null = null;

/** 两点之间的圆柱管段，用于拼装车架。 */
function strut(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.TubeGeometry(new THREE.LineCurve3(from, to), 1, radius, 8, false);
  return new THREE.Mesh(geometry, material);
}

function createWheel(tire: THREE.Material, spoke: THREE.Material): THREE.Group {
  const wheel = new THREE.Group();

  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS, 0.018, 10, 64), tire));
  wheel.add(
    new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.026, 0.008, 8, 64), spoke),
  );

  const spokeGeometry = new THREE.CylinderGeometry(
    0.0035,
    0.0035,
    (WHEEL_RADIUS - 0.03) * 2,
    4,
  );
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(spokeGeometry, spoke);
    // 每根辐条沿一条直径方向，旋转半圈即可覆盖整圈。
    mesh.rotation.z = (i * Math.PI) / 12;
    wheel.add(mesh);
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 16), spoke);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);

  return wheel;
}

/**
 * 自行车（Bicycle）。
 *
 * 用管道拼出菱形车架，车轮由轮圈、轮圈内环、12 根辐条与花鼓组成，
 * 另有车把、车座、牙盘与曲柄脚踏。车轮与曲柄持续转动，像在空转骑行。
 */
export const bicycle: PresetDefinition = {
  color: 0xe11d48,
  build: () => {
    const group = new THREE.Group();

    const frameMaterial = createMetalMaterial(0xe11d48, { roughness: 0.3 });
    const tireMaterial = createMetalMaterial(0x1f2937, { roughness: 0.65, metalness: 0.15 });
    const metalMaterial = createMetalMaterial(0xcbd5e1, { roughness: 0.25 });
    const darkMaterial = createMetalMaterial(0x475569, { roughness: 0.45 });

    const rearWheel = createWheel(tireMaterial, metalMaterial);
    rearWheel.position.copy(REAR_AXLE);
    const frontWheel = createWheel(tireMaterial, metalMaterial);
    frontWheel.position.copy(FRONT_AXLE);
    group.add(rearWheel, frontWheel);

    // 车架主三角 + 后三角 + 前叉。
    group.add(
      strut(BOTTOM_BRACKET, SEAT_TOP, 0.016, frameMaterial),
      strut(BOTTOM_BRACKET, HEAD_BOTTOM, 0.018, frameMaterial),
      strut(SEAT_TOP, HEAD_TOP, 0.015, frameMaterial),
      strut(HEAD_TOP, HEAD_BOTTOM, 0.019, frameMaterial),
      strut(BOTTOM_BRACKET, REAR_AXLE, 0.011, frameMaterial),
      strut(SEAT_TOP, REAR_AXLE, 0.011, frameMaterial),
    );

    // 前叉做成左右两片，夹住前轮。
    for (const offset of [-0.026, 0.026]) {
      const from = HEAD_BOTTOM.clone().setZ(offset * 0.4);
      const to = FRONT_AXLE.clone().setZ(offset);
      group.add(strut(from, to, 0.012, frameMaterial));
    }

    // 座杆与车座。
    const seatPostTop = SEAT_TOP.clone().add(new THREE.Vector3(-0.02, 0.06, 0));
    group.add(strut(SEAT_TOP, seatPostTop, 0.01, metalMaterial));
    const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 12), darkMaterial);
    saddle.position.copy(seatPostTop).add(new THREE.Vector3(-0.01, 0.02, 0));
    saddle.scale.set(1.5, 0.34, 0.7);
    group.add(saddle);

    // 把立 + 车把 + 握把。
    const stemTop = HEAD_TOP.clone().add(new THREE.Vector3(0, 0.09, 0));
    group.add(strut(HEAD_TOP, stemTop, 0.012, metalMaterial));
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 12), metalMaterial);
    bar.rotation.x = Math.PI / 2;
    bar.position.copy(stemTop);
    group.add(bar);
    for (const offset of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.09, 12), darkMaterial);
      grip.rotation.x = Math.PI / 2;
      grip.position.copy(stemTop).setZ(offset * 0.13);
      group.add(grip);
    }

    // 牙盘 + 曲柄 + 脚踏，整组绕 Z 轴转动。
    const crankGroup = new THREE.Group();
    crankGroup.position.copy(BOTTOM_BRACKET);
    const chainring = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.012, 8, 48),
      metalMaterial,
    );
    chainring.position.z = -0.03;
    crankGroup.add(chainring);

    for (const direction of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.2, 0.018), metalMaterial);
      arm.position.set(0, direction * 0.1, direction * 0.03);
      crankGroup.add(arm);

      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.05), darkMaterial);
      pedal.position.set(0, direction * 0.2, direction * 0.055);
      crankGroup.add(pedal);
    }
    group.add(crankGroup);

    wheels = [rearWheel, frontWheel];
    crank = crankGroup;
    return group;
  },
  animate: (_root, time) => {
    for (const wheel of wheels) wheel.rotation.z = -time * 2.2;
    if (crank) crank.rotation.z = -time * 1.5;
  },
};
