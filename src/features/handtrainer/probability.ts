import type { Rng } from '@/lib/random';

import { metaOf, TAG_BITS, tagMask, type DeckMeta, type HandTag } from './tags';

/**
 * Opening hand probabilities.
 *
 * The deck is grouped into "cells" of cards that carry exactly the same set
 * of tags (e.g. 9 starters, 3 cards that are both starter and extender, 25
 * untagged). The exact probability of any condition is the multivariate
 * hypergeometric sum over all ways to draw the hand from those cells:
 *
 *   P = Σ  Π C(size_i, k_i) / C(N, n)     over all (k_1..k_m) with Σ k_i = n
 *
 * Because a card can carry several tags, conditions such as "starter +
 * handtrap" require two *different* cards; see `distinct`.
 */

export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/** P(X = k) for X ~ Hypergeometric(N, K, n). */
export function hypergeomPmf(N: number, K: number, n: number, k: number): number {
  const total = choose(N, n);
  return total === 0 ? 0 : (choose(K, k) * choose(N - K, n - k)) / total;
}

/** P(X ≥ k): chance to draw at least k of K copies in n cards from N. */
export function hypergeomAtLeast(N: number, K: number, n: number, k: number): number {
  let p = 0;
  for (let i = Math.max(0, k); i <= Math.min(K, n); i++) p += hypergeomPmf(N, K, n, i);
  return Math.min(1, p);
}

/** Tag counts of one hand, independent of how it was produced. */
export type HandCounts = {
  /** Number of cards in the hand carrying the tag. */
  count: (tag: HandTag) => number;
  /** Number of cards carrying at least one of the tags. */
  countAny: (...tags: HandTag[]) => number;
  size: number;
};

export type HandPredicate = (hand: HandCounts) => boolean;

/** True if two *different* cards fill role a and role b. */
export function distinct(hand: HandCounts, a: HandTag, b: HandTag): boolean {
  return hand.count(a) >= 1 && hand.count(b) >= 1 && hand.countAny(a, b) >= 2;
}

/** Builds HandCounts from (tag mask, number of cards) pairs. */
function countsFrom(masks: ArrayLike<number>, amounts: ArrayLike<number>, length: number, size: number): HandCounts {
  const sum = (bits: number) => {
    let total = 0;
    for (let i = 0; i < length; i++) if (masks[i] & bits) total += amounts[i];
    return total;
  };
  return {
    size,
    count: (tag) => sum(TAG_BITS[tag]),
    countAny: (...tags) => sum(tags.reduce((bits, tag) => bits | TAG_BITS[tag], 0)),
  };
}

export type DeckProfile = {
  deckSize: number;
  /** Cards grouped by identical tag sets. */
  cells: { mask: number; size: number }[];
  /** Tag mask of every card in deck order (for simulation). */
  cardMasks: number[];
};

export function buildProfile(mainDeck: number[], meta: DeckMeta): DeckProfile {
  const bySignature = new Map<number, number>();
  const cardMasks = mainDeck.map((id) => tagMask(metaOf(meta, id).tags));
  for (const mask of cardMasks) bySignature.set(mask, (bySignature.get(mask) ?? 0) + 1);
  return {
    deckSize: mainDeck.length,
    cells: [...bySignature].map(([mask, size]) => ({ mask, size })),
    cardMasks,
  };
}

/** Exact probabilities of all predicates for a hand of `handSize` cards. */
export function exactProbabilities(profile: DeckProfile, handSize: number, predicates: HandPredicate[]): number[] {
  const { cells, deckSize } = profile;
  const n = Math.min(handSize, deckSize);
  const total = choose(deckSize, n);
  const hits = predicates.map(() => 0);
  if (total === 0) return hits;

  const masks = cells.map((c) => c.mask);
  const drawn = new Array<number>(cells.length).fill(0);
  const counts = countsFrom(masks, drawn, cells.length, n);

  // Cards still available in cells i..end, to prune impossible branches.
  const remaining = new Array<number>(cells.length + 1).fill(0);
  for (let i = cells.length - 1; i >= 0; i--) remaining[i] = remaining[i + 1] + cells[i].size;

  const visit = (cell: number, left: number, ways: number) => {
    if (cell === cells.length) {
      if (left !== 0) return;
      predicates.forEach((test, i) => {
        if (test(counts)) hits[i] += ways;
      });
      return;
    }
    const max = Math.min(left, cells[cell].size);
    const min = Math.max(0, left - remaining[cell + 1]);
    for (let k = min; k <= max; k++) {
      drawn[cell] = k;
      visit(cell + 1, left - k, ways * choose(cells[cell].size, k));
    }
    drawn[cell] = 0;
  };
  visit(0, n, 1);
  return hits.map((h) => h / total);
}

/**
 * Monte Carlo check: draws `iterations` random hands and counts how often
 * each predicate holds. Returns hit counts so batches can be accumulated.
 */
export function simulateHits(
  profile: DeckProfile,
  handSize: number,
  predicates: HandPredicate[],
  iterations: number,
  rng: Rng
): number[] {
  const deck = profile.cardMasks.slice();
  const n = Math.min(handSize, deck.length);
  const hits = predicates.map(() => 0);
  const handMasks = new Array<number>(n).fill(0);
  const ones = new Array<number>(n).fill(1);
  const counts = countsFrom(handMasks, ones, n, n);

  for (let iteration = 0; iteration < iterations; iteration++) {
    // Partial Fisher–Yates: only the first n positions are needed.
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rng() * (deck.length - i));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
      handMasks[i] = deck[i];
    }
    for (let p = 0; p < predicates.length; p++) if (predicates[p](counts)) hits[p]++;
  }
  return hits;
}
