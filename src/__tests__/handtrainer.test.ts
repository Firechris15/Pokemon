import { classifyHand, evaluatePractice } from '@/features/handtrainer/classify';
import { moveStarter, rankedStarters, toggleTag } from '@/features/handtrainer/metaOps';
import { suggestedTags, type DeckMeta } from '@/features/handtrainer/tags';

import { ID } from './helpers';

function metaWith(): DeckMeta {
  let meta: DeckMeta = {};
  meta = toggleTag(meta, ID.snakeEyeAsh, 'starter').meta; // rank 1
  meta = toggleTag(meta, ID.poplar, 'starter').meta; // rank 2
  meta = toggleTag(meta, ID.ash, 'handtrap').meta;
  meta = toggleTag(meta, ID.nibiru, 'handtrap').meta;
  meta = toggleTag(meta, ID.darkMagician, 'brick').meta;
  meta = toggleTag(meta, ID.ttt, 'breaker').meta;
  return meta;
}

const names: Record<number, string> = {
  [ID.snakeEyeAsh]: 'Snake-Eye Ash',
  [ID.poplar]: 'Snake-Eyes Poplar',
  [ID.ash]: 'Ash Blossom',
  [ID.nibiru]: 'Nibiru',
  [ID.darkMagician]: 'Dark Magician',
  [ID.ttt]: 'Triple Tactics Talent',
  [ID.imperm]: 'Infinite Impermanence',
};
const nameOf = (id: number) => names[id] ?? String(id);

describe('tag editing', () => {
  it('ranks starters in the order they were tagged and compacts on removal', () => {
    let meta = metaWith();
    expect(rankedStarters(meta)).toEqual([ID.snakeEyeAsh, ID.poplar]);
    meta = toggleTag(meta, ID.imperm, 'starter').meta;
    expect(meta[ID.imperm].starterRank).toBe(3);
    const removed = toggleTag(meta, ID.snakeEyeAsh, 'starter');
    expect(removed.meta[ID.snakeEyeAsh]).toBeUndefined(); // no tags left
    expect(rankedStarters(removed.meta)).toEqual([ID.poplar, ID.imperm]);
    expect(removed.meta[ID.poplar].starterRank).toBe(1);
    expect(removed.changed.sort()).toEqual([ID.snakeEyeAsh, ID.poplar, ID.imperm].sort());
  });

  it('moves starters up and down', () => {
    const meta = metaWith();
    const order = rankedStarters(meta);
    const moved = moveStarter(meta, order, ID.poplar, -1).meta;
    expect(rankedStarters(moved)).toEqual([ID.poplar, ID.snakeEyeAsh]);
    expect(moveStarter(meta, order, ID.snakeEyeAsh, -1).changed).toEqual([]);
  });

  it('keeps tags in canonical order and suggests well-known cards', () => {
    const meta = toggleTag(toggleTag({}, 1, 'brick').meta, 1, 'starter').meta;
    expect(meta[1].tags).toEqual(['starter', 'brick']);
    expect(suggestedTags('Ash Blossom & Joyous Spring')).toEqual(['handtrap']);
    expect(suggestedTags('Triple Tactics Talent')).toEqual(['breaker']);
    expect(suggestedTags('Snake-Eye Ash')).toEqual([]);
  });
});

describe('classifyHand', () => {
  it('finds the best starter by rank', () => {
    const c = classifyHand([ID.poplar, ID.ash, ID.snakeEyeAsh, ID.darkMagician, ID.imperm], metaWith(), true);
    expect(c.playable).toBe(true);
    expect(c.starters).toEqual([ID.snakeEyeAsh, ID.poplar]);
    expect(c.best).toBe(ID.snakeEyeAsh);
    expect(c.handtraps).toEqual([ID.ash]);
    expect(c.bricks).toEqual([ID.darkMagician]);
  });

  it('lets a board breaker carry the hand only when going second', () => {
    const hand = [ID.ttt, ID.ash, ID.darkMagician, ID.imperm, ID.nibiru];
    expect(classifyHand(hand, metaWith(), true).playable).toBe(false);
    const second = classifyHand([...hand, ID.imperm], metaWith(), false);
    expect(second.playable).toBe(true);
    expect(second.best).toBe(ID.ttt);
  });
});

describe('evaluatePractice', () => {
  const meta = metaWith();
  const playableHand = [ID.poplar, ID.snakeEyeAsh, ID.ash, ID.darkMagician, ID.imperm];
  const deadHand = [ID.ash, ID.nibiru, ID.darkMagician, ID.imperm, ID.ttt];

  it('accepts the best starter', () => {
    const r = evaluatePractice(playableHand, meta, true, { playable: true, cardId: ID.snakeEyeAsh }, nameOf);
    expect(r.correct).toBe(true);
    expect(r.cardVerdict).toBe('best');
    expect(r.messages[0]).toBe('Richtig: Snake-Eye Ash ist die beste Wahl.');
  });

  it('explains when another starter would be better', () => {
    const r = evaluatePractice(playableHand, meta, true, { playable: true, cardId: ID.poplar }, nameOf);
    expect(r.correct).toBe(false);
    expect(r.cardVerdict).toBe('other-starter');
    expect(r.messages[0]).toContain('laut deiner Rangliste ist Snake-Eye Ash aber besser');
  });

  it('flags a non-starter pick', () => {
    const r = evaluatePractice(playableHand, meta, true, { playable: true, cardId: ID.ash }, nameOf);
    expect(r.cardVerdict).toBe('wrong');
    expect(r.messages[0]).toBe('Ash Blossom ist kein Starter. Die beste Wahl wäre Snake-Eye Ash.');
  });

  it('grades the playable decision', () => {
    expect(evaluatePractice(deadHand, meta, true, { playable: false, cardId: null }, nameOf).correct).toBe(true);
    const wrong = evaluatePractice(deadHand, meta, true, { playable: true, cardId: ID.ash }, nameOf);
    expect(wrong.correct).toBe(false);
    expect(wrong.messages[0]).toBe('Nicht spielbar – dir fehlt ein Starter.');
    const missed = evaluatePractice(playableHand, meta, true, { playable: false, cardId: null }, nameOf);
    expect(missed.correct).toBe(false);
    expect(missed.messages[0]).toBe('Doch spielbar – beste Wahl: Snake-Eye Ash.');
  });
});
