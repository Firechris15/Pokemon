import { getDb, getMeta, setMeta } from '@/db/database';

import { newPlayerRating } from './rating';
import type { DailyEntry, PlayerRating, Puzzle, PuzzleResult, PuzzleStats } from './types';

type PuzzleRow = {
  id: string;
  title: string;
  difficulty: number;
  rating: number;
  source: string;
  data: string;
  created_at: number;
  updated_at: number;
};

/** Fields stored as JSON in the data column. */
type PuzzleData = Pick<Puzzle, 'task' | 'description' | 'explanation' | 'goal' | 'initial' | 'solutions'>;

function rowToPuzzle(row: PuzzleRow): Puzzle | null {
  try {
    const data = JSON.parse(row.data) as PuzzleData;
    if (!data.initial || !Array.isArray(data.solutions)) return null;
    return {
      id: row.id,
      title: row.title,
      difficulty: Math.min(5, Math.max(1, row.difficulty)) as Puzzle['difficulty'],
      rating: row.rating,
      source: row.source === 'sample' || row.source === 'import' ? row.source : 'user',
      task: data.task ?? '',
      description: data.description ?? '',
      explanation: data.explanation ?? '',
      goal: data.goal === 'sequence' ? 'sequence' : 'lethal',
      initial: data.initial,
      solutions: data.solutions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

function toData(puzzle: Puzzle): string {
  const data: PuzzleData = {
    task: puzzle.task,
    description: puzzle.description,
    explanation: puzzle.explanation,
    goal: puzzle.goal,
    initial: puzzle.initial,
    solutions: puzzle.solutions,
  };
  return JSON.stringify(data);
}

export async function listPuzzles(): Promise<Puzzle[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PuzzleRow>('SELECT * FROM puzzles ORDER BY created_at, id');
  return rows.map(rowToPuzzle).filter((p): p is Puzzle => p !== null);
}

const UPSERT = `INSERT INTO puzzles (id, title, difficulty, rating, source, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

export async function savePuzzle(puzzle: Puzzle): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `${UPSERT} ON CONFLICT(id) DO UPDATE SET title = excluded.title, difficulty = excluded.difficulty, rating = excluded.rating,
       data = excluded.data, updated_at = excluded.updated_at`,
    puzzle.id,
    puzzle.title,
    puzzle.difficulty,
    puzzle.rating,
    puzzle.source,
    toData(puzzle),
    puzzle.createdAt,
    puzzle.updatedAt
  );
}

/** Adds puzzles that are not stored yet; existing ones (maybe edited) stay untouched. */
export async function insertMissing(puzzles: Puzzle[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const p of puzzles) {
      await db.runAsync(`${UPSERT} ON CONFLICT(id) DO NOTHING`, p.id, p.title, p.difficulty, p.rating, p.source, toData(p), p.createdAt, p.updatedAt);
    }
  });
}

export async function updatePuzzleRating(id: string, rating: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE puzzles SET rating = ? WHERE id = ?', rating, id);
}

export async function deletePuzzle(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM puzzles WHERE id = ?', id);
    await db.runAsync('DELETE FROM puzzle_attempts WHERE puzzle_id = ?', id);
  });
}

export async function recordAttempt(result: PuzzleResult): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO puzzle_attempts (puzzle_id, created_at, solved, mistakes, hints, duration_ms, rated, rating_before, rating_after, daily)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    result.puzzleId,
    Date.now(),
    result.solved ? 1 : 0,
    result.mistakes,
    result.hints,
    Math.round(result.durationMs),
    result.rated ? 1 : 0,
    result.ratingBefore,
    result.ratingAfter,
    result.daily ? 1 : 0
  );
}

export async function puzzleStats(): Promise<Record<string, PuzzleStats>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ puzzle_id: string; attempts: number; solved: number; last_at: number | null }>(
    'SELECT puzzle_id, COUNT(*) AS attempts, MAX(solved) AS solved, MAX(created_at) AS last_at FROM puzzle_attempts GROUP BY puzzle_id'
  );
  return Object.fromEntries(rows.map((r) => [r.puzzle_id, { attempts: r.attempts, solved: r.solved === 1, lastAt: r.last_at }]));
}

const RATING_KEY = 'puzzle_rating';

export async function getPlayerRating(): Promise<PlayerRating> {
  const raw = await getMeta(RATING_KEY);
  if (!raw) return newPlayerRating();
  try {
    const parsed = JSON.parse(raw) as PlayerRating;
    return typeof parsed.rating === 'number' ? parsed : newPlayerRating();
  } catch {
    return newPlayerRating();
  }
}

export async function setPlayerRating(rating: PlayerRating): Promise<void> {
  await setMeta(RATING_KEY, JSON.stringify(rating));
}

export async function listDaily(): Promise<DailyEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ day: string; puzzle_id: string; solved_at: number | null }>('SELECT * FROM daily_puzzles ORDER BY day');
  return rows.map((r) => ({ day: r.day, puzzleId: r.puzzle_id, solvedAt: r.solved_at }));
}

export async function saveDaily(entry: DailyEntry): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO daily_puzzles (day, puzzle_id, solved_at) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET puzzle_id = excluded.puzzle_id, solved_at = excluded.solved_at',
    entry.day,
    entry.puzzleId,
    entry.solvedAt
  );
}

export const SAMPLES_KEY = 'puzzle_samples_version';
