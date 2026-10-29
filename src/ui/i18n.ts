export type Lang = 'zh' | 'en';

/** 语言选择在 localStorage 中的键名。 */
const STORAGE_KEY = '3dview.lang';

/** 中英文文案表：按 key 组织，{name} 形式为插值占位符。 */
const DICTIONARIES: Record<Lang, Record<string, string>> = {
  zh: {
    'app.title': '3DView · 头动视差 · 手势旋转',
    'app.subtitle': '头动视差 · 手势旋转',
    'chip.face': '面部',
    'chip.hand': '手部',

    'panel.parallax': '头动视差',
    'panel.parallax.enable': '启用',
    'panel.parallax.gain': '视差强度',
    'panel.parallax.distance': '观看距离',
    'panel.parallax.calibrate': '重新校准',

    'panel.gesture': '手势',
    'panel.gesture.enable': '捏合拖拽旋转',
    'panel.gesture.sensitivity': '灵敏度',
    'panel.gesture.landmarks': '显示关键点',

    'panel.model': '模型',
    'panel.model.preset': '内置',
    'panel.model.open': '打开本地文件…',
    'panel.model.autorotate': '自动旋转',
    'panel.model.reset': '重置视角',

    'panel.display': '显示',
    'panel.display.ground': '显示地面',
    'panel.display.background': '显示背景',
    'panel.display.backgroundColor': '背景颜色',

    'panel.system': '系统',
    'panel.system.camera': '使用摄像头',
    'panel.system.language': '语言',

    'model.torusKnot': '环面纽结',
    'model.icosahedron': '二十面体',
    'model.sphere': '球体',
    'model.box': '立方体',
    'model.torus': '圆环',

    'preview.hint': '捏合拇指与食指并拖动即可旋转',
    'drop.hint': '松开以载入模型 (.glb / .gltf / .obj)',

    'status.loadingModels': '正在加载识别模型…',
    'status.ready': '识别已就绪',
    'status.calibrating': '校准中，请正对摄像头保持不动…',
    'status.noFace': '未检测到面部',

    'toast.calibrated': '校准完成',
    'toast.modelLoaded': '已载入 {name}',
    'toast.loadFailed': '载入失败：{message}',
    'toast.cameraDenied': '摄像头权限被拒绝，已切换为鼠标 / 触摸操作',
    'toast.cameraNotFound': '未找到可用摄像头，已切换为鼠标 / 触摸操作',
    'toast.cameraInsecure': '摄像头需要 HTTPS 或 localhost 环境，已切换为鼠标 / 触摸操作',
    'toast.cameraUnsupported': '当前浏览器不支持摄像头访问，已切换为鼠标 / 触摸操作',
    'toast.cameraUnknown': '摄像头启动失败：{message}',
    'toast.gpuFallback': 'GPU 加速不可用，已回退到 CPU 识别（帧率可能下降）',
    'toast.modelsFailed': '识别模型加载失败：{message}',
  },
  en: {
    'app.title': '3DView · Head Parallax · Pinch Rotate',
    'app.subtitle': 'head parallax · pinch rotate',
    'chip.face': 'Face',
    'chip.hand': 'Hand',

    'panel.parallax': 'Head parallax',
    'panel.parallax.enable': 'Enabled',
    'panel.parallax.gain': 'Strength',
    'panel.parallax.distance': 'View distance',
    'panel.parallax.calibrate': 'Recalibrate',

    'panel.gesture': 'Gesture',
    'panel.gesture.enable': 'Pinch to rotate',
    'panel.gesture.sensitivity': 'Sensitivity',
    'panel.gesture.landmarks': 'Show landmarks',

    'panel.model': 'Model',
    'panel.model.preset': 'Preset',
    'panel.model.open': 'Open local file…',
    'panel.model.autorotate': 'Auto rotate',
    'panel.model.reset': 'Reset view',

    'panel.display': 'Display',
    'panel.display.ground': 'Show ground',
    'panel.display.background': 'Show background',
    'panel.display.backgroundColor': 'Background color',

    'panel.system': 'System',
    'panel.system.camera': 'Use camera',
    'panel.system.language': 'Language',

    'model.torusKnot': 'Torus knot',
    'model.icosahedron': 'Icosahedron',
    'model.sphere': 'Sphere',
    'model.box': 'Cube',
    'model.torus': 'Torus',

    'preview.hint': 'Pinch thumb + index and drag to rotate',
    'drop.hint': 'Drop to load a model (.glb / .gltf / .obj)',

    'status.loadingModels': 'Loading vision models…',
    'status.ready': 'Tracking ready',
    'status.calibrating': 'Calibrating, please face the camera…',
    'status.noFace': 'No face detected',

    'toast.calibrated': 'Calibration complete',
    'toast.modelLoaded': 'Loaded {name}',
    'toast.loadFailed': 'Failed to load: {message}',
    'toast.cameraDenied': 'Camera permission denied — using mouse / touch instead',
    'toast.cameraNotFound': 'No camera found — using mouse / touch instead',
    'toast.cameraInsecure': 'Camera requires HTTPS or localhost — using mouse / touch instead',
    'toast.cameraUnsupported': 'Camera is not supported here — using mouse / touch instead',
    'toast.cameraUnknown': 'Camera failed to start: {message}',
    'toast.gpuFallback': 'GPU delegate unavailable, falling back to CPU tracking',
    'toast.modelsFailed': 'Failed to load vision models: {message}',
  },
};

/** 决定初始语言：优先用户上次的选择，其次跟随浏览器语言。 */
export function detectLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** 极简 i18n 实现：按 key 查表、支持插值，并把结果写入带 data-i18n 的节点。 */
export class I18n {
  lang: Lang;

  constructor(lang: Lang = detectLang()) {
    this.lang = lang;
  }

  /** 取文案；当前语言缺失时回退到中文，再缺失则直接返回 key 本身。 */
  t(key: string, params?: Record<string, string | number>): string {
    const template = DICTIONARIES[this.lang][key] ?? DICTIONARIES.zh[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  }

  /** 切换语言并持久化，刷新后保持。 */
  setLang(lang: Lang): void {
    this.lang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
  }

  /** 遍历 DOM，把 [data-i18n] 节点的文本替换为当前语言的文案。 */
  apply(root: ParentNode = document): void {
    document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
    document.title = this.t('app.title');
    for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
      const key = element.dataset.i18n;
      if (key) element.textContent = this.t(key);
    }
  }
}
