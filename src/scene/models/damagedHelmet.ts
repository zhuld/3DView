import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PresetDefinition } from './types';

/**
 * 损伤头盔（Damaged Helmet）。
 *
 * 来自 Khronos glTF 示例模型（CC BY 4.0），是一顶带 PBR 材质与法线贴图的
 * 复杂头盔模型，用于展示查看器对带贴图的 glTF 资源的加载与渲染能力。
 * 通过 load() 异步加载 public/models/DamagedHelmet.glb。
 */
export const damagedHelmet: PresetDefinition = {
  color: 0xb08d57,
  build: () => new THREE.Group(),
  load: async () => {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(
      `${import.meta.env.BASE_URL}models/DamagedHelmet.glb`,
    );
    return gltf.scene;
  },
};