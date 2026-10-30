import * as THREE from 'three';
import { createMetalMaterial } from './materials';
import type { PresetDefinition } from './types';

/** 桨叶半径。 */
const BLADE_LENGTH = 0.58;
/** 桨叶沿半径方向的扭转总角度（弧度）。 */
const BLADE_TWIST = 0.85;

/**
 * 生成一片桨叶：先在 XY 平面画出带收窄的桨叶轮廓并挤出厚度，
 * 再按半径对顶点绕径向轴做渐进扭转，得到接近真实螺旋桨的迎角分布。
 */
function createBladeGeometry(): THREE.BufferGeometry {
  const rootChord = 0.22;
  const tipChord = 0.09;
  const thickness = 0.034;

  const shape = new THREE.Shape();
  shape.moveTo(0, -rootChord / 2);
  shape.bezierCurveTo(
    BLADE_LENGTH * 0.35,
    -rootChord * 0.62,
    BLADE_LENGTH * 0.75,
    -tipChord * 0.6,
    BLADE_LENGTH,
    -tipChord / 2,
  );
  shape.quadraticCurveTo(BLADE_LENGTH * 1.06, 0, BLADE_LENGTH, tipChord / 2);
  shape.bezierCurveTo(
    BLADE_LENGTH * 0.75,
    tipChord * 0.6,
    BLADE_LENGTH * 0.35,
    rootChord * 0.62,
    0,
    rootChord / 2,
  );
  shape.lineTo(0, -rootChord / 2);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -thickness / 2);

  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const angle = BLADE_TWIST * (x / BLADE_LENGTH);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    position.setY(i, y * cos - z * sin);
    position.setZ(i, y * sin + z * cos);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

let rotor: THREE.Group | null = null;

/**
 * 螺旋桨（Propeller）。
 *
 * 三片扭转桨叶围绕推进轴（Z 轴）均布，前端是整流锥，中心是桨毂。
 * 整体略微倾斜摆放，让旋转轴斜指向观察者，避免正对时的平面感。
 */
export const propeller: PresetDefinition = {
  color: 0xcbd5e1,
  build: () => {
    const group = new THREE.Group();
    group.rotation.set(0.28, 0.55, 0);

    const bladeGeometry = createBladeGeometry();
    const bladeMaterial = createMetalMaterial(0xcbd5e1, { roughness: 0.28 });
    const hubMaterial = createMetalMaterial(0x64748b, { roughness: 0.35 });
    const spinnerMaterial = createMetalMaterial(0xfbbf24, { roughness: 0.2 });

    const spin = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
      blade.rotation.z = (i * Math.PI * 2) / 3;
      spin.add(blade);
    }

    // 桨毂：圆柱默认沿 Y 轴，旋转 90° 后对齐推进轴 Z。
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 24), hubMaterial);
    hub.rotation.x = Math.PI / 2;
    spin.add(hub);

    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 24), spinnerMaterial);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = 0.2;
    spin.add(spinner);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 16), hubMaterial);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -0.2;
    spin.add(shaft);

    group.add(spin);
    rotor = spin;
    return group;
  },
  animate: (_root, time) => {
    if (rotor) rotor.rotation.z = time * 6;
  },
};
