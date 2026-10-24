import { buildProfile, choose, distinct, exactProbabilities, hypergeomAtLeast, simulateHits } from '@/features/handtrainer/probability';
import { isPlayable, STARTER_BUCKETS, STATS } from '@/features/handtrainer/stats';
import type { DeckMeta, HandTag } from '@/features/handtrainer/tags';
import { seededRng } from '@/lib/random';

/** Builds a deck of `size` fake cards; groups get consecutive ids and the given tags. */
function deck(groups: { count: number; tags: HandTag[] }[], size: number) {
  const ids: number[] = [];
  const meta: DeckMeta = {};
  let id = 1;
  for (const group of groups) {
    for (let i = 0; i < group.count; i++, id++) {
      ids.push(id);
      meta[id] = { tags: group.tags, starterRank: group.tags.includes('starter') ? id : null };
    }
  }
  while (ids.length < size) ids.push(id++);
  return { ids, meta };
}

describe('hypergeometric basics', () => {
  it('computes binomial coefficients', () => {
    expect(choose(40, 5)).toBe(658008);
    expect(choose(60, 6)).toBe(50063860);
    expect(choose(5, 6)).toBe(0);
  });

  it('matches known opening hand odds', () => {
    // 3 copies in 40 cards, 5-card hand: 33.75 %
    expect(hypergeomAtLeast(40, 3, 5, 1)).toBeCloseTo(1 - 435897 / 658008, 10);
    expect(hypergeomAtLeast(40, 3, 5, 1)).toBeCloseTo(0.33755, 5);
    // 12 starters, going first vs second
    expect(hypergeomAtLeast(40, 12, 5, 1)).toBeCloseTo(1 - choose(28, 5) / choose(40, 5), 10);
    expect(hypergeomAtLeast(40, 12, 6, 1)).toBeCloseTo(1 - choose(28, 6) / choose(40, 6), 10);
  });
});

describe('exactProbabilities', () => {
  const { ids, meta } = deck(
    [
      { count: 12, tags: ['starter'] },
      { count: 3, tags: ['starter', 'extender'] },
      { count: 6, tags: ['handtrap'] },
      { count: 2, tags: ['brick'] },
    ],
    40
  );
  const profile = buildProfile(ids, meta);

  it('agrees with the single-category formula', () => {
    const [starter, handtrap] = exactProbabilities(profile, 5, [(h) => h.count('starter') >= 1, (h) => h.count('handtrap') >= 1]);
    expect(starter).toBeCloseTo(hypergeomAtLeast(40, 15, 5, 1), 10);
    expect(handtrap).toBeCloseTo(hypergeomAtLeast(40, 6, 5, 1), 10);
  });

  it('distributions sum to one', () => {
    const buckets = exactProbabilities(profile, 6, STARTER_BUCKETS.map((b) => b.test));
    expect(buckets.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(buckets[0]).toBeCloseTo(choose(25, 6) / choose(40, 6), 10);
  });

  it('requires two different cards for combined roles', () => {
    const single = deck([{ count: 1, tags: ['starter', 'handtrap'] }], 40);
    const p = buildProfile(single.ids, single.meta);
    const [both, distinctRoles] = exactProbabilities(p, 5, [
      (h) => h.count('starter') >= 1 && h.count('handtrap') >= 1,
      (h) => distinct(h, 'starter', 'handtrap'),
    ]);
    expect(both).toBeCloseTo(5 / 40, 10);
    expect(distinctRoles).toBe(0);
  });

  it('matches the Monte Carlo simulation', () => {
    const predicates = STATS.map((s) => s.test(true));
    const exact = exactProbabilities(profile, 5, predicates);
    const iterations = 60000;
    const hits = simulateHits(profile, 5, predicates, iterations, seededRng(42));
    hits.forEach((h, i) => expect(Math.abs(h / iterations - exact[i])).toBeLessThan(0.012));
  });

  it('handles small decks and empty tags', () => {
    const tiny = deck([{ count: 2, tags: ['starter'] }], 4);
    const [p] = exactProbabilities(buildProfile(tiny.ids, tiny.meta), 5, [(h) => h.count('starter') === 2]);
    expect(p).toBe(1); // the whole deck is drawn
    // An empty deck gives an empty hand: no starter, and trivially no bricks.
    const [starter, noBrick] = exactProbabilities(buildProfile([], {}), 5, [(h) => h.count('starter') >= 1, (h) => h.count('brick') === 0]);
    expect(starter).toBe(0);
    expect(noBrick).toBe(1);
  });
});

describe('playable rule', () => {
  const hand = (starter: number, breaker: number) => ({
    size: 5,
    count: (tag: HandTag) => (tag === 'starter' ? starter : tag === 'breaker' ? breaker : 0),
    countAny: () => starter + breaker,
  });
  it('needs a starter going first, starter or breaker going second', () => {
    expect(isPlayable(hand(1, 0), true)).toBe(true);
    expect(isPlayable(hand(0, 1), true)).toBe(false);
    expect(isPlayable(hand(0, 1), false)).toBe(true);
    expect(isPlayable(hand(0, 0), false)).toBe(false);
  });
});
