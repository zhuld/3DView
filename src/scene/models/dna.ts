import * as THREE from 'three';
import { createMetalMaterial } from './materials';
import type { PresetDefinition } from './types';

/** 双螺旋骨架半径。 */
const STRAND_RADIUS = 0.34;
/** 双螺旋总高度。 */
const STRAND_HEIGHT = 1.25;
/** 螺旋圈数。 */
const TURNS = 2.5;
/** 碱基对数量。 */
const PAIR_COUNT = 26;

/** 一条骨架的空间螺旋曲线，两条骨架通过 phase 相差 π 形成互补双螺旋。 */
class StrandCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly phase: number) {
    super();
  }

  override getPoint(t: number): THREE.Vector3 {
    const angle = t * Math.PI * 2 * TURNS + this.phase;
    return new THREE.Vector3(
      STRAND_RADIUS * Math.cos(angle),
      (t - 0.5) * STRAND_HEIGHT,
      STRAND_RADIUS * Math.sin(angle),
    );
  }
}

/**
 * DNA 双螺旋（DNA Double Helix）。
 *
 * 两条反向平行的螺旋骨架用 TubeGeometry 包络，中间用圆柱表示碱基对横档，
 * 横档按四种碱基配色交替，整体缓慢绕自身长轴旋转。
 */
export const dna: PresetDefinition = {
  color: 0x7dd3fc,
  build: () => {
    const group = new THREE.Group();

    const strandColors = [0x7dd3fc, 0xf9a8d4];
    for (const [index, phase] of [0, Math.PI].entries()) {
      const geometry = new THREE.TubeGeometry(new StrandCurve(phase), 240, 0.035, 12, false);
      const mesh = new THREE.Mesh(
        geometry,
        createMetalMaterial(strandColors[index], { roughness: 0.3 }),
      );
      group.add(mesh);
    }

    // 单位高度的圆柱，按两点距离缩放即可当作任意长度的横档。
    const rungGeometry = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
    const baseColors = [0xfbbf24, 0x34d399, 0x60a5fa, 0xf472b6];
    const baseMaterials = baseColors.map((color) =>
      createMetalMaterial(color, { roughness: 0.35 }),
    );
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < PAIR_COUNT; i++) {
      const t = (i + 0.5) / PAIR_COUNT;
      const angle = t * Math.PI * 2 * TURNS;
      const y = (t - 0.5) * STRAND_HEIGHT;
      const start = new THREE.Vector3(
        STRAND_RADIUS * Math.cos(angle),
        y,
        STRAND_RADIUS * Math.sin(angle),
      );
      const end = new THREE.Vector3(
        STRAND_RADIUS * Math.cos(angle + Math.PI),
        y,
        STRAND_RADIUS * Math.sin(angle + Math.PI),
      );

      const rung = new THREE.Mesh(rungGeometry, baseMaterials[i % baseMaterials.length]);
      rung.position.copy(start).add(end).multiplyScalar(0.5);
      rung.quaternion.setFromUnitVectors(up, end.clone().sub(start).normalize());
      rung.scale.y = start.distanceTo(end);
      group.add(rung);
    }

    return group;
  },
  animate: (root, time) => {
    root.rotation.y = time * 0.35;
  },
};
