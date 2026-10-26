import type { ComboReview } from './types';

const DAY = 24 * 60 * 60 * 1000;
/** A failed combo comes back after ten minutes. */
const RELEARN_DELAY = 10 * 60 * 1000;

export function newReview(comboId: string, now = Date.now()): ComboReview {
  return { comboId, ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0, dueAt: now, lastReviewedAt: null, stepErrors: {} };
}

/** Maps the share of steps answered correctly on the first try to an SM-2 grade 0–5. */
export function gradeFromAccuracy(correct: number, total: number): number {
  if (total <= 0) return 0;
  const ratio = correct / total;
  if (ratio >= 1) return 5;
  if (ratio >= 0.9) return 4;
  if (ratio >= 0.75) return 3;
  if (ratio >= 0.5) return 2;
  if (ratio > 0) return 1;
  return 0;
}

/**
 * SM-2 scheduling: correct runs push the next review further out (1 day,
 * 3 days, then interval × ease); a failed run resets the streak and lowers
 * the ease so the combo shows up more often.
 */
export function scheduleReview(review: ComboReview, grade: number, wrongStepIds: string[], now = Date.now()): ComboReview {
  const ease = Math.max(1.3, review.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  const stepErrors = { ...review.stepErrors };
  for (const id of wrongStepIds) stepErrors[id] = (stepErrors[id] ?? 0) + 1;

  if (grade < 3) {
    return { ...review, ease, repetitions: 0, intervalDays: 0, lapses: review.lapses + 1, dueAt: now + RELEARN_DELAY, lastReviewedAt: now, stepErrors };
  }
  const repetitions = review.repetitions + 1;
  const intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(review.intervalDays * ease);
  return { ...review, ease, repetitions, intervalDays, dueAt: now + intervalDays * DAY, lastReviewedAt: now, stepErrors };
}

export function isDue(review: ComboReview | undefined, now = Date.now()): boolean {
  return !review || review.dueAt <= now;
}

/** Most overdue first; among equals, the harder (lower ease) combo first. */
export function compareDue(a: ComboReview | undefined, b: ComboReview | undefined): number {
  const dueA = a?.dueAt ?? 0;
  const dueB = b?.dueAt ?? 0;
  if (dueA !== dueB) return dueA - dueB;
  return (a?.ease ?? 2.5) - (b?.ease ?? 2.5);
}

export function describeDue(review: ComboReview | undefined, now = Date.now()): string {
  if (!review || review.lastReviewedAt === null) return 'Neu';
  const diff = review.dueAt - now;
  if (diff <= 0) return 'Fällig';
  if (diff < 60 * 60 * 1000) return `In ${Math.max(1, Math.round(diff / 60000))} Min.`;
  const hours = Math.round(diff / 3600000);
  if (hours < 20) return `In ${hours} Std.`;
  const days = Math.max(1, Math.round(diff / DAY));
  return days === 1 ? 'Morgen' : `In ${days} Tagen`;
}
