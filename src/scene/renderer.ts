import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface Viewport {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** 显示 / 隐藏地面网格与阴影承接面。 */
  setGroundVisible(visible: boolean): void;
  /**
   * 让地面跟随头动同步旋转：rotation 为世界坐标系下的旋转，pivot 为世界枢轴点。
   * 传入单位四元数即复位到初始朝向。
   */
  setGroundHeadRotation(rotation: THREE.Quaternion, pivot: THREE.Vector3): void;
  /** 显示 / 隐藏纯色背景（隐藏后为透明，露出页面底色）。 */
  setBackgroundVisible(visible: boolean): void;
  setBackgroundColor(color: string): void;
  render(): void;
  dispose(): void;
}

export interface ViewportOptions {
  /** 视口宽高比变化回调，用于同步离轴相机。 */
  onAspectChange?: (aspect: number) => void;
  backgroundColor?: string;
}

/**
 * 创建渲染器、类似摄影棚的环境光照，以及模型下方的地面：
 * 一块柔和的阴影承接面加一层淡淡网格，用于营造空间感。
 */
export function createViewport(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  options: ViewportOptions = {},
): Viewport {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: true,
  });
  // 限制像素比上限为 2，避免高分屏下渲染压力过大。
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  // ACES 色调映射让金属高光更自然，避免过曝。
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const backgroundColor = new THREE.Color(options.backgroundColor ?? '#07090d');
  scene.background = backgroundColor;

  // 用程序化的室内环境生成 PMREM 环境贴图，为金属材质提供反射细节。
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.85;
  // 生成后即可释放临时资源，贴图本身继续使用。
  room.dispose();
  pmrem.dispose();

  // 主光：从右上前方打光，负责高光与投影。
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(2.6, 3.4, 5.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 18;
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  // 轮廓光：从左下后方补冷色边光，把模型从背景中分离出来。
  const rim = new THREE.DirectionalLight(0x7dd3fc, 1.4);
  rim.position.set(-4, -1.6, 2.4);
  scene.add(rim);

  // 半球光提供均匀的天光 / 地面反光，避免暗部死黑。
  scene.add(new THREE.HemisphereLight(0xbcd7ff, 0x0a0f16, 0.45));

  // 阴影承接面与网格统一挂在同一个组里，
  // 这样头动视差时可以整组跟随模型绕同一枢轴旋转，二者始终保持刚体关系。
  const ground = new THREE.Group();

  // 仅接收阴影的透明地面，让模型看起来"落"在某个平面上。
  const groundShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 16),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.34 }),
  );
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.y = -1.02;
  groundShadow.receiveShadow = true;
  ground.add(groundShadow);

  // 地面网格：淡色细线，只作空间参考，不参与深度写入。
  const grid = new THREE.GridHelper(22, 44, 0x1e293b, 0x131c27);
  grid.position.y = -1.01;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of gridMaterials) {
    material.transparent = true;
    material.opacity = 0.55;
    material.depthWrite = false;
  }
  ground.add(grid);
  scene.add(ground);

  const groundOffset = new THREE.Vector3();
  const resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    // 宽高比变化后离轴相机需要重建投影矩阵。
    options.onAspectChange?.(width / Math.max(height, 1));
  };
  window.addEventListener('resize', resize);
  resize();

  return {
    renderer,
    scene,
    setGroundVisible: (visible) => {
      ground.visible = visible;
    },
    setGroundHeadRotation: (rotation, pivot) => {
      // 绕世界枢轴 P 旋转对应组变换 T(P)·R·T(-P)，即位置取 P - R·P、旋转取 R，
      // 子对象保持建模时的世界坐标，整块地面因此与模型保持刚体关系。
      ground.quaternion.copy(rotation);
      ground.position.copy(pivot).sub(groundOffset.copy(pivot).applyQuaternion(rotation));
    },
    setBackgroundVisible: (visible) => {
      // scene.background 为 null 时画布透明；同时给 <html> 打标记供样式联动。
      scene.background = visible ? backgroundColor : null;
      document.documentElement.dataset.backgroundHidden = String(!visible);
    },
    setBackgroundColor: (color) => backgroundColor.set(color),
    render: () => renderer.render(scene, camera),
    dispose: () => {
      window.removeEventListener('resize', resize);
      grid.geometry.dispose();
      groundShadow.geometry.dispose();
      (groundShadow.material as THREE.Material).dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
