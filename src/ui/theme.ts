export type ThemePreference = 'auto' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

/** 主题偏好存储键；index.html 的内联引导脚本使用同一键名。 */
const STORAGE_KEY = '3dview.theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/** 读取上次选择；非法值一律回退到跟随系统。 */
export function detectThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' || stored === 'light' ? stored : 'auto';
}

/** 把偏好解析为实际生效的主题。 */
function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'auto') return preference;
  return darkQuery.matches ? 'dark' : 'light';
}

/** 应用主题但不写入存储，用于启动和系统主题变化。 */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

/** 用户主动切换时应用并持久化。 */
export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  localStorage.setItem(STORAGE_KEY, preference);
  return applyTheme(preference);
}

/** 订阅系统主题变化；返回取消订阅函数。 */
export function watchSystemTheme(listener: (resolved: ResolvedTheme) => void): () => void {
  const handler = (): void => listener(darkQuery.matches ? 'dark' : 'light');
  darkQuery.addEventListener('change', handler);
  return () => darkQuery.removeEventListener('change', handler);
}
