import type { Card } from '@/features/cards/types';

import type { ComboAction, ComboStep, Zone } from './types';

export const ACTIONS: ComboAction[] = [
  'normal_summon',
  'special_summon',
  'activate',
  'search',
  'link_summon',
  'xyz_summon',
  'synchro_summon',
  'fusion_summon',
  'ritual_summon',
  'set',
  'send_gy',
  'banish',
  'draw',
  'attach',
  'return_hand',
  'other',
];

export const ACTION_LABELS: Record<ComboAction, string> = {
  normal_summon: 'Normalbeschwörung',
  special_summon: 'Spezialbeschwörung',
  set: 'Setzen',
  activate: 'Effekt aktivieren',
  search: 'Suchen',
  send_gy: 'Auf den Friedhof legen',
  banish: 'Verbannen',
  link_summon: 'Linkbeschwörung',
  xyz_summon: 'Xyz-Beschwörung',
  synchro_summon: 'Synchrobeschwörung',
  fusion_summon: 'Fusionsbeschwörung',
  ritual_summon: 'Ritualbeschwörung',
  draw: 'Ziehen',
  attach: 'Als Xyz-Material anhängen',
  return_hand: 'Auf die Hand zurück',
  other: 'Sonstiges',
};

/** How the related cards of a step are called, per action. */
export const TARGET_LABELS: Record<ComboAction, string> = {
  normal_summon: 'Tribute',
  special_summon: 'Beteiligte Karten',
  set: 'Tribute',
  activate: 'Ziele / Kosten',
  search: 'Sucht',
  send_gy: 'Legt auf den Friedhof',
  banish: 'Verbannt',
  link_summon: 'Materialien',
  xyz_summon: 'Materialien',
  synchro_summon: 'Materialien',
  fusion_summon: 'Materialien',
  ritual_summon: 'Tribute',
  draw: 'Zieht',
  attach: 'Hängt an',
  return_hand: 'Bringt zurück',
  other: 'Beteiligte Karten',
};

export const ZONE_LABELS: Record<Zone, string> = {
  hand: 'Hand',
  field: 'Feld',
  gy: 'Friedhof',
  banished: 'Verbannt',
  material: 'Xyz-Material',
  deck: 'Deck',
  extra: 'Extra Deck',
};

export type BoardZone = Exclude<Zone, 'deck' | 'extra'>;

/** Zones shown on the quiz board, in display order. */
export const BOARD_ZONES: BoardZone[] = ['hand', 'field', 'material', 'gy', 'banished'];

/** Where cards usually go for an action; the editor lets the user override it. */
export function defaultMoves(action: ComboAction, card?: Pick<Card, 'cardClass' | 'race'> | null): Pick<ComboStep, 'cardTo' | 'targetsTo'> {
  switch (action) {
    case 'normal_summon':
    case 'set':
      return { cardTo: 'field', targetsTo: 'gy' };
    case 'special_summon':
      return { cardTo: 'field', targetsTo: null };
    case 'activate':
      return { cardTo: activatedCardZone(card), targetsTo: null };
    case 'search':
    case 'draw':
    case 'return_hand':
      return { cardTo: null, targetsTo: 'hand' };
    case 'send_gy':
      return { cardTo: null, targetsTo: 'gy' };
    case 'banish':
      return { cardTo: null, targetsTo: 'banished' };
    case 'xyz_summon':
      return { cardTo: 'field', targetsTo: 'material' };
    case 'attach':
      return { cardTo: null, targetsTo: 'material' };
    case 'link_summon':
    case 'synchro_summon':
    case 'fusion_summon':
    case 'ritual_summon':
      return { cardTo: 'field', targetsTo: 'gy' };
    case 'other':
      return { cardTo: null, targetsTo: null };
  }
}

/** Normal/Quick-Play spells and normal traps resolve to the GY; continuous ones stay. */
function activatedCardZone(card?: Pick<Card, 'cardClass' | 'race'> | null): Zone | null {
  if (!card) return null;
  if (card.cardClass === 'spell') return card.race === 'Continuous' || card.race === 'Field' || card.race === 'Equip' ? 'field' : 'gy';
  if (card.cardClass === 'trap') return card.race === 'Continuous' ? 'field' : 'gy';
  return null;
}

/** "Effekt aktivieren: Snake-Eye Ash – Sucht: Snake-Eyes Poplar" */
export function describeStep(step: Pick<ComboStep, 'cardId' | 'action' | 'targets'>, nameOf: (id: number) => string): string {
  const main = `${ACTION_LABELS[step.action]}: ${nameOf(step.cardId)}`;
  if (step.targets.length === 0) return main;
  return `${main} – ${TARGET_LABELS[step.action]}: ${step.targets.map(nameOf).join(', ')}`;
}

/** Identity of a step for comparing quiz answers (order of targets is irrelevant). */
export function stepKey(step: Pick<ComboStep, 'cardId' | 'action' | 'targets'>): string {
  return `${step.cardId}|${step.action}|${[...step.targets].sort((a, b) => a - b).join(',')}`;
}
