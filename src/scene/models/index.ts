import type { PresetName, PresetDefinition } from './types';
import { DEFAULT_PRESET } from './types';

import { torusKnot } from './torusKnot';
import { helix } from './helix';
import { knot } from './knot';
import { superformula } from './superformula';
import { mobius } from './mobius';
import { dna } from './dna';
import { propeller } from './propeller';
import { lorenz } from './lorenz';
import { bicycle } from './bicycle';
import { sierpinski } from './sierpinski';
import { gyroscope } from './gyroscope';

export type { PresetName, PresetDefinition };
export { DEFAULT_PRESET };
export {
  torusKnot,
  helix,
  knot,
  superformula,
  mobius,
  dna,
  propeller,
  lorenz,
  bicycle,
  sierpinski,
  gyroscope,
};

export const PRESETS: Record<PresetName, PresetDefinition> = {
  torusKnot,
  helix,
  knot,
  superformula,
  mobius,
  dna,
  propeller,
  lorenz,
  bicycle,
  sierpinski,
  gyroscope,
};

