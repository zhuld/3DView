import type { PresetName, PresetDefinition } from './types';
import { DEFAULT_PRESET } from './types';

import { torusKnot } from './torusKnot';
import { helix } from './helix';
import { knot } from './knot';
import { superformula } from './superformula';

export type { PresetName, PresetDefinition };
export { DEFAULT_PRESET };
export {
  torusKnot,
  helix,
  knot,
  superformula,
};

export const PRESETS: Record<PresetName, PresetDefinition> = {
  torusKnot,
  helix,
  knot,
  superformula,
};

