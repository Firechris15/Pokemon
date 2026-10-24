import { getDb } from '@/db/database';

import type { Combo, ComboReview, ComboStep, QuizMode } from './types';

type ComboRow = {
  id: string;
  name: string;
  deck_id: string | null;
  data: string;
  notes: string;
  created_at: number;
  updated_at: number;
};

type ReviewRow = {
  combo_id: string;
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  due_at: number;
  last_reviewed_at: number | null;
  step_errors: string;
};

type ComboData = { startingHand: number[]; steps: ComboStep[]; endBoard: number[] };

function parseData(json: string): ComboData {
  try {
    const data = JSON.parse(json) as Partial<ComboData>;
    return {
      startingHand: Array.isArray(data.startingHand) ? data.startingHand : [],
      steps: Array.isArray(data.steps) ? data.steps : [],
      endBoard: Array.isArray(data.endBoard) ? data.endBoard : [],
    };
  } catch {
    return { startingHand: [], steps: [], endBoard: [] };
  }
}

function rowToCombo(row: ComboRow): Combo {
  return {
    id: row.id,
    name: row.name,
    deckId: row.deck_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...parseData(row.data),
  };
}

function rowToReview(row: ReviewRow): ComboReview {
  let stepErrors: Record<string, number> = {};
  try {
    stepErrors = JSON.parse(row.step_errors) ?? {};
  } catch {
    stepErrors = {};
  }
  return {
    comboId: row.combo_id,
    ease: row.ease,
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    lapses: row.lapses,
    dueAt: row.due_at,
    lastReviewedAt: row.last_reviewed_at,
    stepErrors,
  };
}

export async function listCombos(): Promise<Combo[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ComboRow>('SELECT * FROM combos ORDER BY updated_at DESC');
  return rows.map(rowToCombo);
}

export async function saveCombo(combo: Combo): Promise<void> {
  const db = await getDb();
  const data: ComboData = { startingHand: combo.startingHand, steps: combo.steps, endBoard: combo.endBoard };
  await db.runAsync(
    `INSERT INTO combos (id, name, deck_id, data, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, deck_id = excluded.deck_id, data = excluded.data,
       notes = excluded.notes, updated_at = excluded.updated_at`,
    combo.id,
    combo.name,
    combo.deckId,
    JSON.stringify(data),
    combo.notes,
    combo.createdAt,
    combo.updatedAt
  );
}

export async function deleteCombo(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM combos WHERE id = ?', id);
    await db.runAsync('DELETE FROM combo_reviews WHERE combo_id = ?', id);
    await db.runAsync('DELETE FROM combo_attempts WHERE combo_id = ?', id);
  });
}

export async function listReviews(): Promise<ComboReview[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ReviewRow>('SELECT * FROM combo_reviews');
  return rows.map(rowToReview);
}

export async function saveReview(review: ComboReview): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO combo_reviews (combo_id, ease, interval_days, repetitions, lapses, due_at, last_reviewed_at, step_errors)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(combo_id) DO UPDATE SET ease = excluded.ease, interval_days = excluded.interval_days,
       repetitions = excluded.repetitions, lapses = excluded.lapses, due_at = excluded.due_at,
       last_reviewed_at = excluded.last_reviewed_at, step_errors = excluded.step_errors`,
    review.comboId,
    review.ease,
    review.intervalDays,
    review.repetitions,
    review.lapses,
    review.dueAt,
    review.lastReviewedAt,
    JSON.stringify(review.stepErrors)
  );
}

export async function recordAttempt(comboId: string, mode: QuizMode, correct: number, total: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO combo_attempts (combo_id, created_at, mode, correct, total) VALUES (?, ?, ?, ?, ?)',
    comboId,
    Date.now(),
    mode,
    correct,
    total
  );
}

export type AttemptStats = { runs: number; correct: number; total: number };

export async function attemptStats(): Promise<Record<string, AttemptStats>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ combo_id: string; runs: number; correct: number; total: number }>(
    'SELECT combo_id, COUNT(*) AS runs, SUM(correct) AS correct, SUM(total) AS total FROM combo_attempts GROUP BY combo_id'
  );
  return Object.fromEntries(rows.map((r) => [r.combo_id, { runs: r.runs, correct: r.correct, total: r.total }]));
}
