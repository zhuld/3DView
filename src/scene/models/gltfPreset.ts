import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PresetDefinition } from './types';

/**
 * 通用的 glTF/GLB 预设工厂：模型文件放在 public/models/，代码只负责加载与归一化。
 * 这样「模型」与「代码」完全分离，新增模型只需下载文件并注册一行。
 */
export function createGltfPreset(fileName: string, color: number): PresetDefinition {
  return {
    color,
    build: () => new THREE.Group(),
    load: async () => {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(
        `${import.meta.env.BASE_URL}models/${fileName}`,
      );
      return { scene: gltf.scene, animations: gltf.animations };
    },
  };
}