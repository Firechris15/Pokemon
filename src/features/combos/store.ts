import { create } from 'zustand';

import { createId } from '@/lib/id';

import { summarizeRun, type RunResult } from './quiz';
import * as repo from './repository';
import { compareDue, gradeFromAccuracy, isDue, newReview, scheduleReview } from './srs';
import type { Combo, ComboReview, QuizMode } from './types';

type CombosState = {
  combos: Combo[];
  reviews: Record<string, ComboReview>;
  stats: Record<string, repo.AttemptStats>;
  loaded: boolean;
  load: () => Promise<void>;
  create: (name: string, deckId: string | null) => Promise<Combo>;
  save: (combo: Combo) => Promise<void>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<Combo | null>;
  /** Stores a finished quiz run and schedules the next review. */
  recordRun: (comboId: string, mode: QuizMode, results: RunResult[]) => Promise<ComboReview>;
};

export const useCombos = create<CombosState>((set, get) => ({
  combos: [],
  reviews: {},
  stats: {},
  loaded: false,

  async load() {
    const [combos, reviews, stats] = await Promise.all([repo.listCombos(), repo.listReviews(), repo.attemptStats()]);
    set({ combos, reviews: Object.fromEntries(reviews.map((r) => [r.comboId, r])), stats, loaded: true });
  },

  async create(name, deckId) {
    const now = Date.now();
    const combo: Combo = { id: createId(), name, deckId, startingHand: [], steps: [], endBoard: [], notes: '', createdAt: now, updatedAt: now };
    await repo.saveCombo(combo);
    set((s) => ({ combos: [combo, ...s.combos] }));
    return combo;
  },

  async save(combo) {
    const updated = { ...combo, updatedAt: Date.now() };
    set((s) => ({ combos: [updated, ...s.combos.filter((c) => c.id !== combo.id)] }));
    await repo.saveCombo(updated);
  },

  async remove(id) {
    await repo.deleteCombo(id);
    set((s) => {
      const reviews = { ...s.reviews };
      delete reviews[id];
      return { combos: s.combos.filter((c) => c.id !== id), reviews };
    });
  },

  async duplicate(id) {
    const source = get().combos.find((c) => c.id === id);
    if (!source) return null;
    const now = Date.now();
    const copy: Combo = { ...source, id: createId(), name: `${source.name} (Kopie)`, createdAt: now, updatedAt: now };
    await repo.saveCombo(copy);
    set((s) => ({ combos: [copy, ...s.combos] }));
    return copy;
  },

  async recordRun(comboId, mode, results) {
    const { correct, total, wrongStepIds } = summarizeRun(results);
    const previous = get().reviews[comboId] ?? newReview(comboId);
    const review = scheduleReview(previous, gradeFromAccuracy(correct, total), wrongStepIds);
    await repo.saveReview(review);
    await repo.recordAttempt(comboId, mode, correct, total);
    set((s) => {
      const old = s.stats[comboId] ?? { runs: 0, correct: 0, total: 0 };
      return {
        reviews: { ...s.reviews, [comboId]: review },
        stats: { ...s.stats, [comboId]: { runs: old.runs + 1, correct: old.correct + correct, total: old.total + total } },
      };
    });
    return review;
  },
}));

export function useCombo(id: string | undefined): Combo | undefined {
  return useCombos((s) => s.combos.find((c) => c.id === id));
}

/** Combos with at least one step that are due for review, most urgent first. */
export function dueCombos(combos: Combo[], reviews: Record<string, ComboReview>, now = Date.now()): Combo[] {
  return combos
    .filter((c) => c.steps.length > 0 && isDue(reviews[c.id], now))
    .sort((a, b) => compareDue(reviews[a.id], reviews[b.id]));
}
