import { I18n } from './i18n';
import type { PresetName } from '../scene/modelStage';
import {
  applyTheme,
  detectThemePreference,
  setThemePreference,
  watchSystemTheme,
  type ThemePreference,
} from './theme';

/** 面板各控件触发的事件回调，由 main.ts 注入具体实现。 */
export interface PanelHandlers {
  onParallaxToggle: (enabled: boolean) => void;
  onGain: (value: number) => void;
  onDistance: (value: number) => void;
  onGroundToggle: (visible: boolean) => void;
  onBackgroundToggle: (visible: boolean) => void;
  onBackgroundColor: (color: string) => void;
  onCalibrate: () => void;
  onGestureToggle: (enabled: boolean) => void;
  onSensitivity: (value: number) => void;
  onLandmarksToggle: (enabled: boolean) => void;
  onPreset: (name: PresetName) => void;
  onOpenFile: (file: File) => void;
  onAutoRotate: (enabled: boolean) => void;
  onReset: () => void;
  onCameraToggle: (enabled: boolean) => void;
}

/** 按 id 取元素，缺失时直接抛错，便于尽早暴露模板与代码不一致的问题。 */
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

/** 追踪状态：off 关闭、on 正常、warn 未检测到。 */
type ChipState = 'off' | 'on' | 'warn';

/** 数值统一保留两位小数显示。 */
const format = (value: number): string => value.toFixed(2);
/** 面板自动收起前的空闲时间（毫秒）。 */
const AUTO_HIDE_DELAY_MS = 4500;
/** 普通提示自动消失的时间；错误提示默认常驻，由用户手动关闭。 */
const TOAST_DURATION_MS = 4200;
/** 追踪状态的播报合并延迟：状态抖动时不至于把读屏器刷屏。 */
const ANNOUNCE_DELAY_MS = 800;

/**
 * 右上角控制面板。
 *
 * 负责绑定所有控件事件、把状态回写到界面（状态芯片、FPS、提示条），
 * 并在鼠标离开一段时间后自动收起，避免遮挡画面。
 */
export class Panel {
  private readonly parallaxToggle = element<HTMLInputElement>('opt-parallax');
  private readonly gain = element<HTMLInputElement>('opt-gain');
  private readonly gainOutput = element<HTMLOutputElement>('out-gain');
  private readonly distance = element<HTMLInputElement>('opt-distance');
  private readonly distanceOutput = element<HTMLOutputElement>('out-distance');
  private readonly groundToggle = element<HTMLInputElement>('opt-ground');
  private readonly backgroundToggle = element<HTMLInputElement>('opt-background');
  private readonly backgroundColor = element<HTMLInputElement>('opt-background-color');
  private readonly gestureToggle = element<HTMLInputElement>('opt-gesture');
  private readonly sensitivity = element<HTMLInputElement>('opt-sensitivity');
  private readonly sensitivityOutput = element<HTMLOutputElement>('out-sensitivity');
  private readonly landmarks = element<HTMLInputElement>('opt-landmarks');
  private readonly preset = element<HTMLSelectElement>('opt-preset');
  private readonly autoRotate = element<HTMLInputElement>('opt-autorotate');
  private readonly cameraToggle = element<HTMLInputElement>('opt-camera');
  private readonly theme = element<HTMLSelectElement>('opt-theme');
  private readonly language = element<HTMLSelectElement>('opt-language');

  private readonly fileInput = element<HTMLInputElement>('file-input');
  private readonly toastElement = element<HTMLDivElement>('toast');
  private readonly toastText = element<HTMLSpanElement>('toast-text');
  private readonly toastClose = element<HTMLButtonElement>('toast-close');
  private readonly chipFps = element<HTMLSpanElement>('chip-fps');
  private readonly chipFace = element<HTMLSpanElement>('chip-face');
  private readonly chipHand = element<HTMLSpanElement>('chip-hand');
  private readonly chipBackend = element<HTMLSpanElement>('chip-backend');
  private readonly liveStatus = element<HTMLSpanElement>('tracking-status');
  private readonly liveDot = element<HTMLSpanElement>('live-dot');
  private readonly panel = element<HTMLElement>('panel');
  private readonly panelToggle = element<HTMLButtonElement>('panel-toggle');

  private toastTimer = 0;
  private announceTimer = 0;
  private autoHideTimer = 0;
  private lastFpsUpdate = 0;
  private faceState: ChipState = 'off';
  private handState: ChipState = 'off';

  constructor(
    readonly i18n: I18n,
    handlers: PanelHandlers,
  ) {
    this.language.value = i18n.lang;

    this.parallaxToggle.addEventListener('change', () =>
      handlers.onParallaxToggle(this.parallaxToggle.checked),
    );
    this.gain.addEventListener('input', () => {
      this.gainOutput.value = format(this.gain.valueAsNumber);
      handlers.onGain(this.gain.valueAsNumber);
    });
    this.distance.addEventListener('input', () => {
      this.distanceOutput.value = format(this.distance.valueAsNumber);
      handlers.onDistance(this.distance.valueAsNumber);
    });
    this.groundToggle.addEventListener('change', () =>
      handlers.onGroundToggle(this.groundToggle.checked),
    );
    this.backgroundToggle.addEventListener('change', () =>
      handlers.onBackgroundToggle(this.backgroundToggle.checked),
    );
    this.backgroundColor.addEventListener('input', () =>
      handlers.onBackgroundColor(this.backgroundColor.value),
    );
    element<HTMLButtonElement>('btn-calibrate').addEventListener('click', () =>
      handlers.onCalibrate(),
    );

    this.gestureToggle.addEventListener('change', () =>
      handlers.onGestureToggle(this.gestureToggle.checked),
    );
    this.sensitivity.addEventListener('input', () => {
      this.sensitivityOutput.value = format(this.sensitivity.valueAsNumber);
      handlers.onSensitivity(this.sensitivity.valueAsNumber);
    });
    this.landmarks.addEventListener('change', () =>
      handlers.onLandmarksToggle(this.landmarks.checked),
    );

    this.preset.addEventListener('change', () =>
      handlers.onPreset(this.preset.value as PresetName),
    );
    element<HTMLButtonElement>('btn-open').addEventListener('click', () =>
      this.fileInput.click(),
    );
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) handlers.onOpenFile(file);
    });
    this.autoRotate.addEventListener('change', () =>
      handlers.onAutoRotate(this.autoRotate.checked),
    );
    element<HTMLButtonElement>('btn-reset').addEventListener('click', () => handlers.onReset());

    this.cameraToggle.addEventListener('change', () =>
      handlers.onCameraToggle(this.cameraToggle.checked),
    );

    const themePreference = detectThemePreference();
    this.theme.value = themePreference;
    applyTheme(themePreference);
    // 只在"跟随系统"时响应系统主题切换，手动选择优先。
    watchSystemTheme(() => {
      if (this.theme.value === 'auto') applyTheme('auto');
    });
    this.theme.addEventListener('change', () => {
      const next: ThemePreference =
        this.theme.value === 'light' ? 'light' : this.theme.value === 'dark' ? 'dark' : 'auto';
      setThemePreference(next);
    });

    this.language.addEventListener('change', () => {
      const next = this.language.value === 'en' ? 'en' : 'zh';
      this.i18n.setLang(next);
      this.i18n.apply();
      // aria-label 不在 data-i18n 覆盖范围内，需要按当前展开状态重新写入。
      this.syncToggleLabel();
    });

    this.toastClose.addEventListener('click', () => this.hideToast());

    this.panelToggle.addEventListener('click', () => {
      this.setOpen(this.panel.dataset.open === 'false');
      if (this.panel.dataset.open === 'true') this.scheduleAutoHide();
    });

    // 鼠标进入或键盘聚焦时暂停自动收起，离开后重新计时。
    this.panel.addEventListener('pointerenter', this.cancelAutoHide);
    this.panel.addEventListener('pointerleave', this.scheduleAutoHide);
    this.panel.addEventListener('focusin', this.cancelAutoHide);
    this.panel.addEventListener('focusout', this.scheduleAutoHide);
    window.addEventListener('pointermove', this.handlePointerMove);

    this.i18n.apply();
    // 面板初始是展开的；显式同步一次 aria-label，避免模板里的默认文案与当前语言不一致。
    this.syncToggleLabel(true);
    this.scheduleAutoHide();
  }

  private readonly cancelAutoHide = (): void => {
    window.clearTimeout(this.autoHideTimer);
  };

  private readonly scheduleAutoHide = (): void => {
    this.cancelAutoHide();
    this.autoHideTimer = window.setTimeout(() => {
      // 指针仍在面板内或有输入焦点时不收起。
      if (this.panel.matches(':hover, :focus-within')) return;
      this.setOpen(false);
    }, AUTO_HIDE_DELAY_MS);
  };

  /** 指针靠近窗口右边缘时自动展开面板，方便快速调节。 */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.clientX < window.innerWidth - 48) return;
    this.setOpen(true);
    this.scheduleAutoHide();
  };

  /** 展开 / 收起面板，同时同步 aria-expanded 以保持可访问性。 */
  private setOpen(open: boolean): void {
    // 指针靠近右边缘时会高频调用，状态没变就不写 DOM。
    if (this.panel.dataset.open === String(open)) return;
    this.panel.dataset.open = String(open);
    this.panelToggle.setAttribute('aria-expanded', String(open));
    this.syncToggleLabel(open);
  }

  /** 图标按钮的 aria-label 不在 data-i18n 覆盖范围内，切换语言后需要单独刷新。 */
  private syncToggleLabel(open = this.panel.dataset.open !== 'false'): void {
    this.panelToggle.setAttribute(
      'aria-label',
      this.i18n.t(open ? 'panel.collapse' : 'panel.expand'),
    );
  }

  /** 手势灵敏度，供 PointerRotator 实时读取。 */
  get gestureSensitivity(): number {
    return this.sensitivity.valueAsNumber;
  }

  get parallaxEnabled(): boolean {
    return this.parallaxToggle.checked;
  }

  get gestureEnabled(): boolean {
    return this.gestureToggle.checked;
  }

  /** 同步摄像头开关的勾选状态（摄像头启动失败或被关闭时调用）。 */
  setCameraToggle(enabled: boolean): void {
    this.cameraToggle.checked = enabled;
  }

  setBackgroundColor(color: string): void {
    this.backgroundColor.value = color;
  }

  /** 更新观看距离滑杆及其数值标签（滚轮缩放时同步）。 */
  setDistanceValue(value: number): void {
    this.distance.value = String(value);
    this.distanceOutput.value = format(value);
  }

  /** 设置面部 / 手部状态芯片：off 关闭、on 正常、warn 未检测到。 */
  setFaceState(state: ChipState): void {
    if (this.faceState === state) return;
    this.faceState = state;
    this.chipFace.dataset.state = state;
    this.scheduleAnnounce();
  }

  setHandState(state: ChipState): void {
    if (this.handState === state) return;
    this.handState = state;
    this.chipHand.dataset.state = state;
    this.scheduleAnnounce();
  }

  /**
   * 把追踪状态播报给读屏器。
   * 逐帧调用会不断触发状态变化，因此合并 800ms 内的多次变更再写入。
   */
  private scheduleAnnounce(): void {
    window.clearTimeout(this.announceTimer);
    this.announceTimer = window.setTimeout(() => {
      const colon = this.i18n.lang === 'zh' ? '：' : ': ';
      const face = `${this.i18n.t('chip.face')}${colon}${this.i18n.t(`state.${this.faceState}`)}`;
      const hand = `${this.i18n.t('chip.hand')}${colon}${this.i18n.t(`state.${this.handState}`)}`;
      this.liveStatus.textContent = `${face} · ${hand}`;
    }, ANNOUNCE_DELAY_MS);
  }

  /** 显示推理后端（GPU / CPU / --），GPU 以外用警告色。 */
  setBackend(label: string): void {
    this.chipBackend.textContent = label;
    this.chipBackend.dataset.state = label.startsWith('GPU') ? 'on' : 'warn';
  }

  /** 控制摄像头"直播"指示点。 */
  setLive(live: boolean): void {
    this.liveDot.dataset.live = String(live);
  }

  /** 更新 FPS 显示；最多每 500ms 刷新一次，避免频繁写 DOM。 */
  updateFps(fps: number, timeMs: number): void {
    if (timeMs - this.lastFpsUpdate < 500) return;
    this.lastFpsUpdate = timeMs;
    this.chipFps.textContent = `${fps.toFixed(0)} FPS`;
  }

  /** 校准期间禁用按钮，防止重复触发。 */
  setCalibrating(active: boolean): void {
    const button = element<HTMLButtonElement>('btn-calibrate');
    button.disabled = active;
  }

  /**
   * 弹出提示条；新的提示会覆盖旧的并重新计时。
   * 错误默认常驻（role="alert" + assertive），由用户点关闭按钮收起，避免长信息读不完。
   */
  toast(message: string, kind: 'info' | 'error' = 'info', durationMs?: number): void {
    window.clearTimeout(this.toastTimer);
    this.toastText.textContent = message;
    // 错误走 alert / assertive，读屏会打断当前播报；普通提示走 status / polite。
    this.toastText.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    this.toastText.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
    this.toastElement.dataset.kind = kind;
    this.toastElement.hidden = false;
    const autoHide = durationMs ?? (kind === 'error' ? 0 : TOAST_DURATION_MS);
    if (autoHide > 0) this.toastTimer = window.setTimeout(() => this.hideToast(), autoHide);
  }

  /** 立即隐藏提示条并清除定时器。 */
  hideToast(): void {
    window.clearTimeout(this.toastTimer);
    this.toastElement.hidden = true;
  }
}
