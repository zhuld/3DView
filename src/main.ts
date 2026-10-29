import * as THREE from 'three';
import { clamp } from './util/math';
import { createViewport } from './scene/renderer';
import { ParallaxCamera } from './scene/parallaxCamera';
import { ModelStage } from './scene/modelStage';
import { VideoSource, VideoSourceError } from './tracking/videoSource';
import { FaceTracker } from './tracking/faceTracker';
import { HandTracker } from './tracking/handTracker';
import { HeadPoseEstimator } from './tracking/headPose';
import { GestureRotator } from './input/gestureRotator';
import { PointerRotator } from './input/pointerFallback';
import { PreviewOverlay } from './ui/overlay';
import { Panel } from './ui/panel';
import { detectLang, I18n } from './ui/i18n';

/** 头部偏移到模型旋转的增益，以及偏航 / 俯仰的上限（弧度）。 */
const HEAD_ROTATION_GAIN = 1.2;
const MAX_HEAD_YAW = 0.55;
const MAX_HEAD_PITCH = 0.4;
const BACKGROUND_COLOR_STORAGE_KEY = '3dview.backgroundColor';
const DEFAULT_BACKGROUND_COLOR = '#2b477e';

/** 按 id 取元素，缺失时立即抛错，避免后面出现难排查的空引用。 */
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

// 读取上次保存的背景颜色，并做格式校验，非法值回退到默认色。
const storedBackgroundColor = localStorage.getItem(BACKGROUND_COLOR_STORAGE_KEY);
const backgroundColor =
  storedBackgroundColor && /^#[\da-f]{6}$/i.test(storedBackgroundColor)
    ? storedBackgroundColor
    : DEFAULT_BACKGROUND_COLOR;

const i18n = new I18n(detectLang());
const headPose = new HeadPoseEstimator();
const parallax = new ParallaxCamera();

const canvas = element<HTMLCanvasElement>('view');
const viewport = createViewport(canvas, parallax.camera, {
  backgroundColor,
  onAspectChange: (aspect) => parallax.setAspect(aspect),
});

const stage = new ModelStage(viewport.scene);
const gesture = new GestureRotator(stage);
const overlay = new PreviewOverlay(
  element<HTMLCanvasElement>('preview-canvas'),
  element<HTMLElement>('preview-card'),
);

let videoSource: VideoSource | null = null;
let faceTracker: FaceTracker | null = null;
let handTracker: HandTracker | null = null;
let trackingStarting = false;
let parallaxEnabled = true;

// 鼠标 / 触摸回退：旋转灵敏度取自面板，滚轮调整观看距离。
new PointerRotator(
  canvas,
  stage,
  () => panel.gestureSensitivity,
  (deltaY) => {
    parallax.baseDistance = clamp(parallax.baseDistance + deltaY * 0.0016, 1.4, 4);
    panel.setDistanceValue(parallax.baseDistance);
  },
);

// 面板回调：把 UI 操作直接作用到视差相机、模型舞台与手势模块上。
const panel = new Panel(i18n, {
  onParallaxToggle: (enabled) => {
    parallaxEnabled = enabled;
  },
  onGain: (value) => {
    parallax.gain = value;
  },
  onDistance: (value) => {
    parallax.baseDistance = value;
  },
  onGroundToggle: (visible) => {
    viewport.setGroundVisible(visible);
  },
  onBackgroundToggle: (visible) => {
    viewport.setBackgroundVisible(visible);
  },
  onBackgroundColor: (color) => {
    viewport.setBackgroundColor(color);
    localStorage.setItem(BACKGROUND_COLOR_STORAGE_KEY, color);
  },
  onCalibrate: () => {
    // 触发一次定时校准，并在按钮上做短暂的防重复点击处理。
    headPose.beginCalibration(performance.now());
    panel.setCalibrating(true);
    window.setTimeout(() => panel.setCalibrating(false), 900);
    panel.toast(i18n.t('status.calibrating'), 'info', 1400);
  },
  onGestureToggle: (enabled) => {
    gesture.enabled = enabled;
    // 关闭手势时立即释放，避免残留的捏合状态继续带动模型。
    if (!enabled) gesture.release();
  },
  onSensitivity: (value) => {
    gesture.sensitivity = value;
  },
  onLandmarksToggle: (enabled) => {
    overlay.showLandmarks = enabled;
  },
  onPreset: (name) => {
    stage.setPreset(name);
  },
  onOpenFile: (file) => {
    void loadModelFile(file);
  },
  onAutoRotate: (enabled) => {
    stage.autoRotate = enabled;
  },
  onReset: () => {
    stage.reset();
  },
  onCameraToggle: (enabled) => {
    if (enabled) void startTracking();
    else stopTracking();
  },
});
panel.setBackgroundColor(backgroundColor);

// 头动校准应等用户坐定后再进行；估计器自身也会在最初若干帧自动校准。
let calibrationRequested = false;

/**
 * 启动摄像头与识别链路。
 * 依次完成：取流 → 初始化面部 / 手部模型 → 启动逐帧回调 → 延时校准。
 * 任一步失败都会回滚状态并提示用户，鼠标 / 触摸操作始终可用。
 */
async function startTracking(): Promise<void> {
  if (trackingStarting || videoSource) return;
  trackingStarting = true;
  panel.setLive(false);

  const source = new VideoSource(element<HTMLElement>('preview-video'));
  try {
    await source.start();
  } catch (error) {
    trackingStarting = false;
    panel.setCameraToggle(false);
    showCameraError(error);
    return;
  }

  videoSource = source;
  overlay.attachVideo(source.video);

  // 面部与手部模型并行初始化，缩短等待时间。
  const face = new FaceTracker();
  const hand = new HandTracker();
  try {
    const [faceBackend, handBackend] = await Promise.all([face.init(), hand.init()]);
    faceTracker = face;
    handTracker = hand;
    // 只有两个任务都跑在 GPU 上才显示 GPU，否则按 CPU 提示。
    const backend = faceBackend === 'GPU' && handBackend === 'GPU' ? 'GPU' : 'CPU';
    panel.setBackend(backend);
    if (backend === 'CPU') panel.toast(i18n.t('toast.gpuFallback'), 'info', 6000);
  } catch (error) {
    console.error('[tracking] model load failed', error);
    face.close();
    hand.close();
    stopTracking();
    panel.setCameraToggle(false);
    panel.toast(
      i18n.t('toast.modelsFailed', {
        message: error instanceof Error ? error.message : String(error),
      }),
      'error',
      8000,
    );
    trackingStarting = false;
    return;
  }

  source.onFrame(onVideoFrame);
  source.startLoop();
  panel.setLive(true);
  panel.setFaceState('warn');
  panel.setHandState('warn');

  if (!calibrationRequested) {
    calibrationRequested = true;
    // 等画面稳定 1.2 秒再校准；若期间已自动完成则跳过。
    window.setTimeout(() => {
      if (headPose.calibrated) return;
      headPose.beginCalibration(performance.now());
    }, 1200);
  }

  trackingStarting = false;
}

/** 停止跟踪并复位所有相关状态（摄像头、识别器、头姿、手势、界面）。 */
function stopTracking(): void {
  videoSource?.stop();
  videoSource = null;
  faceTracker?.close();
  faceTracker = null;
  handTracker?.close();
  handTracker = null;
  headPose.reset();
  gesture.release();
  overlay.detachVideo();
  panel.setLive(false);
  panel.setFaceState('off');
  panel.setHandState('off');
  panel.setBackend('--');
  panel.setCameraToggle(false);
}

/** 把摄像头错误码映射为对应的多语言提示。 */
function showCameraError(error: unknown): void {
  const code = error instanceof VideoSourceError ? error.code : 'unknown';
  const message = error instanceof Error ? error.message : String(error);
  const key =
    code === 'denied'
      ? 'toast.cameraDenied'
      : code === 'notfound'
        ? 'toast.cameraNotFound'
        : code === 'insecure'
          ? 'toast.cameraInsecure'
          : code === 'unsupported'
            ? 'toast.cameraUnsupported'
            : 'toast.cameraUnknown';
  panel.toast(i18n.t(key, { message }), 'error', 8000);
}

let handTick = 0;

/**
 * 摄像头逐帧回调：面部每帧检测（头姿需要连续平滑），
 * 手部隔帧检测以降低开销，最后统一重绘预览。
 */
function onVideoFrame(timeMs: number): void {
  const source = videoSource;
  if (!source) return;

  const video = source.video;
  const faceResult = faceTracker?.detect(video, timeMs) ?? null;
  headPose.update(faceResult, source.width, source.height, timeMs);
  overlay.setFace(faceResult);
  panel.setFaceState(headPose.tracking ? 'on' : 'warn');

  handTick += 1;
  // 手部识别较耗时，每两帧做一次即可满足拖拽的跟手性。
  if (handTick % 2 === 1) {
    const handResult = handTracker?.detect(video, timeMs) ?? null;
    const aspect = source.width / Math.max(source.height, 1);
    gesture.update(handResult, parallax.camera, timeMs, aspect);
    overlay.setHand(handResult);
    overlay.setPinching(gesture.pinching && gesture.grabbedModel);
    panel.setHandState(gesture.handVisible ? 'on' : 'warn');
  }

  overlay.draw();
}

/** 载入本地模型文件，成功后重置视角并提示结果。 */
async function loadModelFile(file: File): Promise<void> {
  try {
    const name = await stage.loadFile(file);
    stage.reset();
    panel.toast(i18n.t('toast.modelLoaded', { name }));
  } catch (error) {
    panel.toast(
      i18n.t('toast.loadFailed', {
        message: error instanceof Error ? error.message : String(error),
      }),
      'error',
      7000,
    );
  }
}

// ---------- 拖拽载入模型 ----------

const dropHint = element<HTMLElement>('drop-hint');
// dragDepth 记录嵌套拖拽的层数，避免子元素触发 dragleave 时提示过早消失。
let dragDepth = 0;

window.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  dragDepth += 1;
  dropHint.hidden = false;
});

window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropHint.hidden = true;
});

window.addEventListener('dragover', (event) => event.preventDefault());

window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropHint.hidden = true;
  const file = event.dataTransfer?.files?.[0];
  if (file) void loadModelFile(file);
});

// ---------- 生命周期 ----------

document.addEventListener('visibilitychange', () => {
  if (!videoSource?.active) return;
  // 页面切到后台时暂停逐帧识别，切回后恢复，节省 CPU / GPU。
  if (document.hidden) videoSource.stopLoop();
  else videoSource.startLoop();
});

window.addEventListener('pagehide', () => {
  // 页面卸载时主动释放摄像头与模型，避免设备被长期占用。
  videoSource?.stop();
  faceTracker?.close();
  handTracker?.close();
});

// ---------- 渲染循环 ----------

const clock = new THREE.Timer();
clock.connect(document);
let frames = 0;
let fpsWindowStart = performance.now();

function renderLoop(timestamp?: number): void {
  requestAnimationFrame(renderLoop);

  clock.update(timestamp);
  // dt 上限 0.1s：标签页恢复时避免自动旋转一次跳很远。
  const delta = Math.min(clock.getDelta(), 0.1);
  if (parallaxEnabled) {
    parallax.update(headPose.sample);
    // 头部左右 / 上下偏移映射为模型偏航 / 俯仰，并做限幅防止转头过度。
    stage.setHeadRotation(
      clamp(-headPose.sample.x * HEAD_ROTATION_GAIN * parallax.gain, -MAX_HEAD_YAW, MAX_HEAD_YAW),
      clamp(
        headPose.sample.y * HEAD_ROTATION_GAIN * parallax.gain,
        -MAX_HEAD_PITCH,
        MAX_HEAD_PITCH,
      ),
    );
  } else {
    parallax.reset();
    stage.setHeadRotation(0, 0);
  }
  // 地面与模型共用同一次头动旋转、同一枢轴，整块场景看起来是"视角在移动"，
  // 而不是模型单独自转（地面不动会立刻暴露模型的旋转）。
  viewport.setGroundHeadRotation(stage.headWorldRotation, stage.headPivot);

  stage.update(delta);
  viewport.render();

  frames += 1;
  const now = performance.now();
  const elapsed = now - fpsWindowStart;
  // 每 500ms 统计一次 FPS，读数既稳定又不至于太迟钝。
  if (elapsed >= 500) {
    panel.updateFps((frames * 1000) / elapsed, now);
    frames = 0;
    fpsWindowStart = now;
  }
}

renderLoop();
// 打开页面即尝试启动摄像头；失败时自动降级为鼠标 / 触摸操作。
void startTracking();

if (import.meta.env.DEV) {
  // 开发模式下暴露实例，便于在控制台手动调参。
  (window as unknown as Record<string, unknown>).__3dview = {
    parallax,
    headPose,
    stage,
    gesture,
    viewport,
  };
}
