import type { Card } from '@/features/cards/types';
import { shuffled, type Rng } from '@/lib/random';

import { stepKey } from './actions';
import { boardAfter } from './state';
import type { Combo, ComboAction, ComboStep } from './types';

export type StepGuess = Pick<ComboStep, 'cardId' | 'action' | 'targets'>;

export type ChoiceOption = { key: string; step: StepGuess; correct: boolean };

const MONSTER_ACTIONS: ComboAction[] = ['normal_summon', 'special_summon', 'activate', 'set'];
const SPELL_TRAP_ACTIONS: ComboAction[] = ['activate', 'set'];

/**
 * Multiple choice options for step `index`: the right step plus plausible
 * distractors, preferring (1) steps that come later in the same combo,
 * (2) other cards on the board doing the same thing, (3) the right card
 * with a different action, (4) earlier steps.
 */
export function buildChoices(
  combo: Pick<Combo, 'startingHand' | 'steps'>,
  index: number,
  rng: Rng,
  cardOf: (id: number) => Card | undefined = () => undefined,
  count = 4
): ChoiceOption[] {
  const correct = combo.steps[index];
  const correctKey = stepKey(correct);
  const seen = new Set([correctKey]);
  const pools: StepGuess[][] = [[], [], [], []];

  const later = combo.steps.slice(index + 1);
  pools[0] = shuffled(later, rng);

  const board = boardAfter(combo, index);
  const others = [...new Set([...board.hand, ...board.field, ...board.gy])].filter((id) => id !== correct.cardId);
  pools[1] = shuffled(others, rng).map((cardId) => ({ cardId, action: correct.action, targets: correct.targets }));

  const card = cardOf(correct.cardId);
  const actions = card && card.cardClass !== 'monster' ? SPELL_TRAP_ACTIONS : MONSTER_ACTIONS;
  pools[2] = shuffled(
    actions.filter((a) => a !== correct.action),
    rng
  ).map((action) => ({ cardId: correct.cardId, action, targets: [] }));

  pools[3] = shuffled(combo.steps.slice(0, index), rng);

  const distractors: StepGuess[] = [];
  // Take at most two from the "later steps" pool so options stay varied.
  const quotas = [2, count, count, count];
  pools.forEach((pool, p) => {
    let taken = 0;
    for (const guess of pool) {
      if (distractors.length >= count - 1 || taken >= quotas[p]) break;
      const key = stepKey(guess);
      if (seen.has(key)) continue;
      seen.add(key);
      distractors.push({ cardId: guess.cardId, action: guess.action, targets: [...guess.targets] });
      taken++;
    }
  });

  const options: ChoiceOption[] = [
    { key: correctKey, step: { cardId: correct.cardId, action: correct.action, targets: [...correct.targets] }, correct: true },
    ...distractors.map((step) => ({ key: stepKey(step), step, correct: false })),
  ];
  return shuffled(options, rng);
}

export type FreeVerdict = 'correct' | 'card-only' | 'action-only' | 'wrong';

/** Free mode: the player picks the card and the action. */
export function checkFreeAnswer(step: ComboStep, answer: { cardId: number | null; action: ComboAction | null }): FreeVerdict {
  const cardOk = answer.cardId === step.cardId;
  const actionOk = answer.action === step.action;
  if (cardOk && actionOk) return 'correct';
  if (cardOk) return 'card-only';
  if (actionOk) return 'action-only';
  return 'wrong';
}

export type RunResult = { stepId: string; correct: boolean };

export function summarizeRun(results: RunResult[]): { correct: number; total: number; wrongStepIds: string[] } {
  return {
    correct: results.filter((r) => r.correct).length,
    total: results.length,
    wrongStepIds: results.filter((r) => !r.correct).map((r) => r.stepId),
  };
}
