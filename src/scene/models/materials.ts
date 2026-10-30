import * as THREE from 'three';

/** 统一的金属质感参数，内置预设与缺失材质的导入模型共用。 */
const METAL_PARAMETERS: THREE.MeshPhysicalMaterialParameters = {
  metalness: 0.4,
  roughness: 0.24,
  clearcoat: 0.65,
  clearcoatRoughness: 0.22,
  envMapIntensity: 1.1,
};

/**
 * 创建与内置预设一致的金属 PBR 材质。
 * 多部件组合模型自带材质，统一走这里以保证整体观感一致；
 * override 用于个别预设微调（例如莫比乌斯环需要双面渲染）。
 */
export function createMetalMaterial(
  color: number,
  override?: THREE.MeshPhysicalMaterialParameters,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ ...METAL_PARAMETERS, ...override, color });
}
