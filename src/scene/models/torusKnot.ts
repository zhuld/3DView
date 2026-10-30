import * as THREE from 'three';
import type { PresetDefinition } from './types';

/** 环面纽结（保留，默认模型）。 */
export const torusKnot: PresetDefinition = {
  color: 0x6ee7d7,
  build: () => new THREE.TorusKnotGeometry(0.62, 0.21, 240, 32, 2, 3),
};
