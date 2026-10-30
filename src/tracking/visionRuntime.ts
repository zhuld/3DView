import { FilesetResolver } from '@mediapipe/tasks-vision';

type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

/** 应用部署后的基础 URL（自动兼容 GitHub Pages 的子路径）。 */
const assetBase = new URL(import.meta.env.BASE_URL, window.location.href);

/** 把相对路径解析为最终可访问的绝对 URL。 */
export function assetUrl(relativePath: string): string {
  return new URL(relativePath, assetBase).href;
}

let filesetPromise: Promise<VisionFileset> | null = null;

/** wasm 运行时只加载一次，脸部与手部任务共用同一份。 */
export function loadVisionFileset(): Promise<VisionFileset> {
  filesetPromise ??= FilesetResolver.forVisionTasks(assetUrl('wasm').replace(/\/$/, ''));
  return filesetPromise;
}

/** 保证时间戳严格递增——这是 MediaPipe VIDEO 模式的硬性要求。 */
export class MonotonicClock {
  private last = -1;

  /** 传入时间并得到可用的时间戳；非法值退回 performance.now()。 */
  next(timeMs: number): number {
    const value = Number.isFinite(timeMs) ? timeMs : performance.now();
    this.last = value > this.last ? value : this.last + 1;
    return this.last;
  }
}
