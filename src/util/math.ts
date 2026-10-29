/** 将数值限制在 [min, max] 范围内。 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);