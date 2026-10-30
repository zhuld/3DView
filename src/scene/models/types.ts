import * as THREE from 'three';

/** 内置模型预设的名称联合类型。每新增一个模型，在此追加一项。 */
export type PresetName =
  | 'torusKnot'
  | 'helix'
  | 'knot'
  | 'superformula'
  | 'mobius'
  | 'dna'
  | 'propeller'
  | 'lorenz'
  | 'bicycle'
  | 'sierpinski'
  | 'gyroscope';

/** 内置模型预设定义：颜色 + 构建/加载方式。
 * build 始终存在，可返回单一 BufferGeometry（简单模型）或 Group（多部件组合模型）。
 * material 可选，用于覆盖单几何体模型的默认金属材质参数。
 * animate 可选，接收模型根节点与自切换以来的累计秒数，驱动内置自转等动画。
 * load 可选（异步加载外部模型，预留接口）。
 */
export interface PresetDefinition {
  color: number;
  build: () => THREE.BufferGeometry | THREE.Group;
  material?: THREE.MeshPhysicalMaterialParameters;
  animate?: (root: THREE.Object3D, time: number) => void;
  load?: () => Promise<THREE.Group>;
}

/** 默认加载的预设名称。 */
export const DEFAULT_PRESET: PresetName = 'torusKnot';

