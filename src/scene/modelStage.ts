import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { DEFAULT_PRESET, type PresetName, PRESETS } from './models/index';

export type { PresetName };

// 旋转轴固定为世界坐标系的 Y（偏航）与 X（俯仰），不随模型自身朝向变化。
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);
/** 归一化后模型的最大边长，保证不同尺寸的模型在画面中观感一致。 */
const FIT_SIZE = 1.6;

// 模型预设定义已独立到 src/scene/models/ 目录，此处统一由 ./models/index 聚合。

/** 需要在销毁时显式释放的 GPU 资源。 */
type Disposable = THREE.BufferGeometry | THREE.Material;

/**
 * 承载被查看的模型。
 *
 * 层级为 group → headMotion → holder：
 * 手势 / 鼠标旋转作用在 group 上，头动（headMotion）在其子级做补偿后的旋转，
 * 两者分处不同层级，因此头动与拖拽旋转互不覆盖，可以叠加使用。
 */
export class ModelStage {
  /** 手势 / 鼠标旋转的载体，也是模型的根节点。 */
  readonly group = new THREE.Group();
  /** 可供射线拾取的网格；只有命中这里的对象，捏合才会抓住模型。 */
  readonly pickables: THREE.Object3D[] = [];

  autoRotate = false;
  /** 自动旋转速度（弧度/秒）。 */
  autoRotateSpeed = 0.45;

  /**
   * 头动旋转枢轴相对模型中心向观察者方向（世界 +z）前移的距离。
   * 0 表示绕模型自身中心自转；值越大，头动时模型越像是绕靠近观察者的一点摆动。
   */
  headPivotForward = 1;

  /**
   * 头动旋转在世界坐标系下的四元数。
   * 地面等场景元素需要共用这份变换，才能和模型一起整体转动——看上去像视角在移动，
   * 而不是模型自己在原地旋转。
   */
  readonly headWorldRotation = new THREE.Quaternion();

  /** 上述头动旋转的世界枢轴点，地面与模型绕同一个点转动。 */
  readonly headPivot = new THREE.Vector3();

  /** 头动旋转的载体，位于 group 内层。 */
  private readonly headMotion = new THREE.Group();
  /** 模型的实际挂载点，便于整体替换模型而不影响上层旋转。 */
  private readonly holder = new THREE.Group();
  private readonly headRotationEuler = new THREE.Euler();
  private readonly headRotation = new THREE.Quaternion();
  private readonly groupInverse = new THREE.Quaternion();
  private readonly pivotWorld = new THREE.Vector3();
  private readonly pivotRotated = new THREE.Vector3();
  private readonly gltfLoader = new GLTFLoader();
  private readonly objLoader = new OBJLoader();
  private disposables: Disposable[] = [];
  private preset: PresetName = DEFAULT_PRESET;

  constructor(scene: THREE.Scene, depth = 1.8) {
    // 模型放到 z = 0 平面之后，离轴相机移动时才会产生运动视差。
    this.group.position.z = -depth;
    this.headPivot.set(0, 0, this.group.position.z + this.headPivotForward);
    this.group.add(this.headMotion);
    this.headMotion.add(this.holder);
    scene.add(this.group);
    this.setPreset(this.preset);
  }

  /** 切换到内置预设，并释放上一个模型的资源。 */
  setPreset(name: PresetName): void {
    const definition = PRESETS[name] ?? PRESETS.torusKnot;
    this.preset = name;
    this.clear();

    const built = definition.build();

    // 多部件组合模型（如自行车、螺旋桨）：build 返回 Group
    if (built instanceof THREE.Group) {
      const root = built;
      root.name = name;
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.holder.add(root);
      this.collect(root);
      return;
    }

    // 单一几何体模型
    const geometry = built;
    const material = this.createMaterial(definition.color);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;

    this.disposables.push(geometry, material);
    this.holder.add(mesh);
    this.pickables.push(mesh);
  }

  /**
   * 载入用户选择的本地模型文件。
   * 支持 .obj / .glb / .gltf，载入后会自动居中并缩放到统一尺寸。
   * @returns 文件名，供界面提示使用
   */
  async loadFile(file: File): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    let object: THREE.Object3D;

    if (extension === 'obj') {
      // OBJ 是纯文本格式，直接解析文本。
      const text = await file.text();
      object = this.objLoader.parse(text);
    } else if (extension === 'glb' || extension === 'gltf') {
      // GLB 是二进制封装，glTF 是 JSON 文本，两者都交给同一个解析器。
      const data = extension === 'glb' ? await file.arrayBuffer() : await file.text();
      object = await new Promise<THREE.Object3D>((resolve, reject) => {
        this.gltfLoader.parse(
          data,
          '',
          (gltf) => resolve(gltf.scene),
          (error) =>
            reject(
              new Error(
                error instanceof Error ? error.message : 'glTF 解析失败 / failed to parse glTF',
              ),
            ),
        );
      });
    } else {
      throw new Error(`不支持的格式 / unsupported format: .${extension || '?'}`);
    }

    let meshCount = 0;
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      meshCount += 1;
      child.castShadow = true;
      child.receiveShadow = true;
      // 部分 OBJ 没有材质，补一个默认材质，否则网格会不可见。
      if (!child.material || (Array.isArray(child.material) && child.material.length === 0)) {
        child.material = this.createMaterial(0xcbd5e1);
      }
    });

    if (meshCount === 0) throw new Error('模型中没有网格 / the file contains no meshes');

    this.clear();
    // 传入 2 倍目标尺寸，让用户导入的模型比内置预设略大一些。
    const wrapper = this.fitToStage(object, FIT_SIZE * 2);
    this.holder.add(wrapper);
    this.collect(wrapper);
    return file.name;
  }

  /** 绕世界轴旋转模型：yaw 为偏航（Y 轴），pitch 为俯仰（X 轴），单位弧度。 */
  rotateBy(yaw: number, pitch: number): void {
    if (yaw) this.group.rotateOnWorldAxis(WORLD_UP, yaw);
    if (pitch) this.group.rotateOnWorldAxis(WORLD_RIGHT, pitch);
  }

  /** 设置头动带来的旋转（弧度）。 */
  setHeadRotation(yaw: number, pitch: number): void {
    this.headRotationEuler.set(pitch, yaw, 0, 'YXZ');
    this.headRotation.setFromEuler(this.headRotationEuler);
    // q_group⁻¹ · q_head · q_group：把世界坐标系下的头动旋转换算到 group 的局部坐标系，
    // 这样即使模型已被手势转过，头动仍然沿固定的场景轴生效。
    this.headMotion.quaternion
      .copy(this.group.quaternion)
      .invert()
      .multiply(this.headRotation)
      .multiply(this.group.quaternion);

    // 绕枢轴 p 旋转等价于 T(p)·R·T(-p)，其中平移项为 p - R·p。
    // 枢轴固定在世界 +z 方向（朝向观察者）距模型中心 headPivotForward 处，
    // 经 group 的拖拽旋转换算回局部坐标系后，模型便不再原地自转，而是绕着靠近观察者的一点摆动。
    this.groupInverse.copy(this.group.quaternion).invert();
    this.pivotWorld.set(0, 0, this.headPivotForward);
    this.pivotRotated.copy(this.pivotWorld).applyQuaternion(this.headRotation);
    this.headMotion.position
      .copy(this.pivotWorld)
      .sub(this.pivotRotated)
      .applyQuaternion(this.groupInverse);

    // 对外暴露世界坐标系下的等价变换（模型的实际世界朝向增量就是 headRotation），
    // 供地面等元素同步旋转；枢轴始终固定在世界 +z 轴上，与拖拽旋转无关。
    this.headWorldRotation.copy(this.headRotation);
    this.headPivot.set(0, 0, this.group.position.z + this.headPivotForward);
  }

  /** 重置为初始朝向（不动缩放与位置）。 */
  reset(): void {
    this.group.quaternion.identity();
  }

  /** 每帧更新，目前只处理自动旋转。 */
  update(deltaSeconds: number): void {
    if (this.autoRotate) {
      this.group.rotateOnWorldAxis(WORLD_UP, this.autoRotateSpeed * deltaSeconds);
    }
  }

  /** 统一的金属质感材质，内置预设与缺失材质的导入模型共用。 */
  private createMaterial(color: number): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.4,
      roughness: 0.24,
      clearcoat: 0.65,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.1,
    });
  }

  /**
   * 把任意模型归一化到统一尺寸并居中。
   * 通过包围盒求最大边长，缩放到 targetSize，再反向平移抵消原始中心偏移。
   */
  private fitToStage(object: THREE.Object3D, targetSize = FIT_SIZE): THREE.Group {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) throw new Error('模型包围盒为空 / empty bounding box');

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDimension;

    // 用外层 Group 承载缩放和平移，保留原始模型自身的 transform。
    const wrapper = new THREE.Group();
    wrapper.add(object);
    wrapper.scale.setScalar(scale);
    wrapper.position.copy(center).multiplyScalar(-scale);
    return wrapper;
  }

  /** 收集可拾取网格，并登记其几何体 / 材质以便后续释放。 */
  private collect(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      this.pickables.push(child);
      this.disposables.push(child.geometry);
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      this.disposables.push(...materials);
    });
  }

  /** 移除当前模型并释放显存资源，防止反复切换时泄漏。 */
  private clear(): void {
    this.holder.clear();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables = [];
    this.pickables.length = 0;
  }
}
