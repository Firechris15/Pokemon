import { distinct, type HandCounts, type HandPredicate } from './probability';
import type { HandTag } from './tags';

export const HAND_SIZE_FIRST = 5;
/** Going second you draw in your first Draw Phase, so 6 cards are available. */
export const HAND_SIZE_SECOND = 6;

export function handSize(goingFirst: boolean): number {
  return goingFirst ? HAND_SIZE_FIRST : HAND_SIZE_SECOND;
}

/**
 * When a hand counts as playable:
 * going first you need a starter; going second a board breaker also lets
 * you play the turn.
 */
export function isPlayable(hand: HandCounts, goingFirst: boolean): boolean {
  return hand.count('starter') >= 1 || (!goingFirst && hand.count('breaker') >= 1);
}

export const PLAYABLE_RULE = {
  first: 'Spielbar = mindestens 1 Starter.',
  second: 'Spielbar = mindestens 1 Starter oder 1 Board-Breaker.',
};

export type StatDef = {
  key: string;
  label: string;
  /** Tags that must exist in the deck for the stat to be meaningful. */
  needs: HandTag[];
  test: (goingFirst: boolean) => HandPredicate;
};

export const STATS: StatDef[] = [
  { key: 'playable', label: 'Spielbare Hand', needs: ['starter'], test: (first) => (h) => isPlayable(h, first) },
  { key: 'starter', label: 'Mind. 1 Starter', needs: ['starter'], test: () => (h) => h.count('starter') >= 1 },
  { key: 'starter2', label: 'Mind. 2 Starter', needs: ['starter'], test: () => (h) => h.count('starter') >= 2 },
  { key: 'starterExtender', label: 'Starter + Extender', needs: ['starter', 'extender'], test: () => (h) => distinct(h, 'starter', 'extender') },
  { key: 'handtrap', label: 'Mind. 1 Handtrap', needs: ['handtrap'], test: () => (h) => h.count('handtrap') >= 1 },
  { key: 'starterHandtrap', label: 'Starter + Handtrap', needs: ['starter', 'handtrap'], test: () => (h) => distinct(h, 'starter', 'handtrap') },
  { key: 'breaker', label: 'Mind. 1 Board-Breaker', needs: ['breaker'], test: () => (h) => h.count('breaker') >= 1 },
  { key: 'interaction', label: 'Handtrap oder Board-Breaker', needs: ['handtrap'], test: () => (h) => h.countAny('handtrap', 'breaker') >= 1 },
  { key: 'noBrick', label: 'Keine Bricks', needs: ['brick'], test: () => (h) => h.count('brick') === 0 },
  { key: 'brick', label: 'Mind. 1 Brick', needs: ['brick'], test: () => (h) => h.count('brick') >= 1 },
  { key: 'brick2', label: '2 oder mehr Bricks', needs: ['brick'], test: () => (h) => h.count('brick') >= 2 },
];

/** Distribution of the number of starters in hand: 0, 1, 2, 3+. */
export const STARTER_BUCKETS: { label: string; test: HandPredicate }[] = [
  { label: '0', test: (h) => h.count('starter') === 0 },
  { label: '1', test: (h) => h.count('starter') === 1 },
  { label: '2', test: (h) => h.count('starter') === 2 },
  { label: '3+', test: (h) => h.count('starter') >= 3 },
];
