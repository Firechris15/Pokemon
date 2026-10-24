import { ACTION_LABELS, defaultMoves, describeStep, stepKey } from '@/features/combos/actions';
import { buildChoices, checkFreeAnswer, summarizeRun } from '@/features/combos/quiz';
import { compareDue, describeDue, gradeFromAccuracy, isDue, newReview, scheduleReview } from '@/features/combos/srs';
import { boardAfter } from '@/features/combos/state';
import { dueCombos } from '@/features/combos/store';
import type { Combo, ComboAction, ComboStep } from '@/features/combos/types';
import { seededRng } from '@/lib/random';

import { cardMap, ID } from './helpers';

const cards = cardMap();
const names: Record<number, string> = { [ID.snakeEyeAsh]: 'Ash', [ID.poplar]: 'Poplar', [ID.snakeEyeFire]: 'Fire', [ID.accesscode]: 'Accesscode', [ID.ash]: 'Blossom' };
const nameOf = (id: number) => names[id] ?? String(id);

let seq = 0;
function step(cardId: number, action: ComboAction, targets: number[] = []): ComboStep {
  return { id: `s${++seq}`, cardId, action, targets, ...defaultMoves(action, cards.get(cardId)), note: '' };
}

/** Snake-Eye line: NS Ash, search Poplar, SS Poplar, Link 2 using both, activate Fire. */
function sampleCombo(): Combo {
  return {
    id: 'c1',
    name: 'Snake-Eye 1-Karten-Combo',
    deckId: null,
    startingHand: [ID.snakeEyeAsh, ID.snakeEyeFire, ID.ash],
    steps: [
      step(ID.snakeEyeAsh, 'normal_summon'),
      step(ID.snakeEyeAsh, 'search', [ID.poplar]),
      step(ID.poplar, 'special_summon'),
      step(ID.accesscode, 'link_summon', [ID.snakeEyeAsh, ID.poplar]),
      step(ID.snakeEyeFire, 'activate'),
    ],
    endBoard: [ID.accesscode, ID.snakeEyeFire],
    notes: '',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('combo actions', () => {
  it('describes steps in German', () => {
    expect(describeStep(sampleCombo().steps[1], nameOf)).toBe('Suchen: Ash – Sucht: Poplar');
    expect(describeStep(sampleCombo().steps[3], nameOf)).toBe('Linkbeschwörung: Accesscode – Materialien: Ash, Poplar');
    expect(ACTION_LABELS.normal_summon).toBe('Normalbeschwörung');
  });

  it('chooses sensible default zones', () => {
    expect(defaultMoves('link_summon')).toEqual({ cardTo: 'field', targetsTo: 'gy' });
    expect(defaultMoves('xyz_summon')).toEqual({ cardTo: 'field', targetsTo: 'material' });
    expect(defaultMoves('activate', cards.get(ID.called))).toEqual({ cardTo: 'gy', targetsTo: null }); // quick-play
    expect(defaultMoves('activate', cards.get(ID.snakeEyeFire))).toEqual({ cardTo: 'field', targetsTo: null }); // continuous
    expect(defaultMoves('activate', cards.get(ID.ash))).toEqual({ cardTo: null, targetsTo: null }); // monster
  });

  it('ignores target order in step keys', () => {
    expect(stepKey({ cardId: 1, action: 'link_summon', targets: [3, 2] })).toBe(stepKey({ cardId: 1, action: 'link_summon', targets: [2, 3] }));
  });
});

describe('board tracking', () => {
  it('follows cards through the combo', () => {
    const combo = sampleCombo();
    expect(boardAfter(combo, 0).hand).toEqual([ID.snakeEyeAsh, ID.snakeEyeFire, ID.ash]);
    const afterSearch = boardAfter(combo, 2);
    expect(afterSearch.field).toEqual([ID.snakeEyeAsh]);
    expect(afterSearch.hand).toEqual([ID.snakeEyeFire, ID.ash, ID.poplar]);
    const afterLink = boardAfter(combo, 4);
    expect(afterLink.field).toEqual([ID.accesscode]);
    expect(afterLink.gy.sort()).toEqual([ID.snakeEyeAsh, ID.poplar].sort());
    const end = boardAfter(combo, 5);
    expect(end.field).toEqual([ID.accesscode, ID.snakeEyeFire]);
    expect(end.hand).toEqual([ID.ash]);
  });
});

describe('quiz', () => {
  it('builds four distinct options with exactly one correct', () => {
    const combo = sampleCombo();
    for (let i = 0; i < combo.steps.length; i++) {
      const options = buildChoices(combo, i, seededRng(i + 1), (id) => cards.get(id));
      expect(options.length).toBeGreaterThanOrEqual(3);
      expect(options.length).toBeLessThanOrEqual(4);
      expect(options.filter((o) => o.correct)).toHaveLength(1);
      expect(new Set(options.map((o) => o.key)).size).toBe(options.length);
      expect(options.find((o) => o.correct)!.key).toBe(stepKey(combo.steps[i]));
    }
  });

  it('is deterministic for a seed', () => {
    const a = buildChoices(sampleCombo(), 1, seededRng(7)).map((o) => o.key);
    const b = buildChoices(sampleCombo(), 1, seededRng(7)).map((o) => o.key);
    expect(a).toEqual(b);
  });

  it('grades free answers', () => {
    const s = sampleCombo().steps[1];
    expect(checkFreeAnswer(s, { cardId: ID.snakeEyeAsh, action: 'search' })).toBe('correct');
    expect(checkFreeAnswer(s, { cardId: ID.snakeEyeAsh, action: 'activate' })).toBe('card-only');
    expect(checkFreeAnswer(s, { cardId: ID.poplar, action: 'search' })).toBe('action-only');
    expect(checkFreeAnswer(s, { cardId: null, action: null })).toBe('wrong');
  });

  it('summarizes a run', () => {
    expect(summarizeRun([{ stepId: 'a', correct: true }, { stepId: 'b', correct: false }])).toEqual({ correct: 1, total: 2, wrongStepIds: ['b'] });
  });
});

describe('spaced repetition (SM-2)', () => {
  const DAY = 86400000;
  it('maps accuracy to grades', () => {
    expect(gradeFromAccuracy(5, 5)).toBe(5);
    expect(gradeFromAccuracy(9, 10)).toBe(4);
    expect(gradeFromAccuracy(3, 4)).toBe(3);
    expect(gradeFromAccuracy(1, 2)).toBe(2);
    expect(gradeFromAccuracy(1, 5)).toBe(1);
    expect(gradeFromAccuracy(0, 5)).toBe(0);
  });

  it('grows the interval on success: 1 day, 3 days, then × ease', () => {
    let r = newReview('c', 0);
    r = scheduleReview(r, 5, [], 0);
    expect(r.intervalDays).toBe(1);
    expect(r.dueAt).toBe(DAY);
    r = scheduleReview(r, 5, [], 0);
    expect(r.intervalDays).toBe(3);
    r = scheduleReview(r, 5, [], 0);
    expect(r.intervalDays).toBe(Math.round(3 * r.ease));
    expect(r.ease).toBeCloseTo(2.8, 5);
  });

  it('resets and lowers ease on failure, counting wrong steps', () => {
    let r = scheduleReview(newReview('c', 0), 5, [], 0);
    r = scheduleReview(r, 1, ['s3', 's4'], 1000);
    expect(r.repetitions).toBe(0);
    expect(r.lapses).toBe(1);
    expect(r.ease).toBeLessThan(2.6);
    expect(r.dueAt).toBe(1000 + 10 * 60 * 1000);
    expect(r.stepErrors).toEqual({ s3: 1, s4: 1 });
    r = scheduleReview(r, 0, ['s3'], 2000);
    expect(r.stepErrors.s3).toBe(2);
    expect(r.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('orders due combos and describes the due date', () => {
    const now = 10 * DAY;
    const overdue = { ...newReview('a', 0), dueAt: now - DAY, lastReviewedAt: 0 };
    const hard = { ...newReview('b', 0), dueAt: now - DAY, ease: 1.5, lastReviewedAt: 0 };
    const later = { ...newReview('c', 0), dueAt: now + 3 * DAY, lastReviewedAt: 0 };
    expect(compareDue(hard, overdue)).toBeLessThan(0);
    expect(isDue(later, now)).toBe(false);
    expect(isDue(undefined, now)).toBe(true);
    expect(describeDue(later, now)).toBe('In 3 Tagen');
    expect(describeDue({ ...later, dueAt: now + DAY - 5000 }, now)).toBe('Morgen');
    expect(describeDue({ ...later, dueAt: now + 5 * 3600000 }, now)).toBe('In 5 Std.');
    expect(describeDue({ ...later, dueAt: now + 10 * 60000 }, now)).toBe('In 10 Min.');
    expect(describeDue(overdue, now)).toBe('Fällig');
    expect(describeDue(undefined, now)).toBe('Neu');

    const combo = sampleCombo();
    const empty = { ...combo, id: 'e', steps: [] };
    const due = dueCombos([{ ...combo, id: 'c' }, { ...combo, id: 'a' }, { ...combo, id: 'b' }, empty], { a: overdue, b: hard, c: later }, now);
    expect(due.map((c) => c.id)).toEqual(['b', 'a']);
  });
});
