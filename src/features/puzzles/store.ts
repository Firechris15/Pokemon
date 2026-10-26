import { create } from 'zustand';

import { getMeta, setMeta } from '@/db/database';
import { emptyDuel } from '@/features/duel/state';
import { createId } from '@/lib/id';

import { dailyStreak, dayKey, pickDaily } from './daily';
import { DIFFICULTY_RATING, rate } from './rating';
import * as repo from './repository';
import { SAMPLES_VERSION, samplePuzzles } from './samples';
import type { DailyEntry, PlayerRating, Puzzle, PuzzleResult, PuzzleStats } from './types';

type PuzzlesState = {
  puzzles: Puzzle[];
  stats: Record<string, PuzzleStats>;
  rating: PlayerRating;
  daily: DailyEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  create: (title: string) => Promise<Puzzle>;
  save: (puzzle: Puzzle) => Promise<void>;
  add: (puzzle: Puzzle) => Promise<void>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<Puzzle | null>;
  /** Updates player and puzzle rating after a rated attempt; returns the change. */
  applyRating: (puzzleId: string, solved: boolean) => Promise<{ before: number; after: number; delta: number }>;
  recordAttempt: (result: PuzzleResult) => Promise<void>;
  /** Today's daily puzzle (chosen and stored on first access). */
  ensureDaily: () => Promise<DailyEntry | null>;
};

export const usePuzzles = create<PuzzlesState>((set, get) => ({
  puzzles: [],
  stats: {},
  rating: { rating: 0, games: 0, best: 0 },
  daily: [],
  loaded: false,

  async load() {
    const samplesVersion = Number((await getMeta(repo.SAMPLES_KEY)) ?? 0);
    if (samplesVersion < SAMPLES_VERSION) {
      await repo.insertMissing(samplePuzzles());
      await setMeta(repo.SAMPLES_KEY, String(SAMPLES_VERSION));
    }
    const [puzzles, stats, rating, daily] = await Promise.all([repo.listPuzzles(), repo.puzzleStats(), repo.getPlayerRating(), repo.listDaily()]);
    set({ puzzles, stats, rating, daily, loaded: true });
    await get().ensureDaily();
  },

  async create(title) {
    const now = Date.now();
    const puzzle: Puzzle = {
      id: createId(),
      title,
      task: 'OTK',
      description: '',
      explanation: '',
      goal: 'lethal',
      difficulty: 3,
      rating: DIFFICULTY_RATING[3],
      initial: emptyDuel(),
      solutions: [],
      source: 'user',
      createdAt: now,
      updatedAt: now,
    };
    await repo.savePuzzle(puzzle);
    set((s) => ({ puzzles: [...s.puzzles, puzzle] }));
    return puzzle;
  },

  async save(puzzle) {
    const updated = { ...puzzle, updatedAt: Date.now() };
    set((s) => ({ puzzles: s.puzzles.map((p) => (p.id === puzzle.id ? updated : p)) }));
    await repo.savePuzzle(updated);
  },

  async add(puzzle) {
    await repo.savePuzzle(puzzle);
    set((s) => ({ puzzles: [...s.puzzles, puzzle] }));
  },

  async remove(id) {
    await repo.deletePuzzle(id);
    set((s) => {
      const stats = { ...s.stats };
      delete stats[id];
      return { puzzles: s.puzzles.filter((p) => p.id !== id), stats };
    });
    await get().ensureDaily();
  },

  async duplicate(id) {
    const source = get().puzzles.find((p) => p.id === id);
    if (!source) return null;
    const now = Date.now();
    const copy: Puzzle = { ...source, id: createId(), title: `${source.title} (Kopie)`, source: 'user', createdAt: now, updatedAt: now };
    await get().add(copy);
    return copy;
  },

  async applyRating(puzzleId, solved) {
    const puzzle = get().puzzles.find((p) => p.id === puzzleId);
    const before = get().rating;
    if (!puzzle) return { before: before.rating, after: before.rating, delta: 0 };
    const result = rate(before, puzzle.rating, solved);
    set((s) => ({
      rating: result.player,
      puzzles: s.puzzles.map((p) => (p.id === puzzleId ? { ...p, rating: result.puzzleRating } : p)),
    }));
    await repo.setPlayerRating(result.player);
    await repo.updatePuzzleRating(puzzleId, result.puzzleRating);
    return { before: before.rating, after: result.player.rating, delta: result.delta };
  },

  async recordAttempt(result) {
    await repo.recordAttempt(result);
    set((s) => {
      const old = s.stats[result.puzzleId] ?? { attempts: 0, solved: false, lastAt: null };
      return { stats: { ...s.stats, [result.puzzleId]: { attempts: old.attempts + 1, solved: old.solved || result.solved, lastAt: Date.now() } } };
    });
    const today = dayKey();
    const entry = get().daily.find((d) => d.day === today);
    if (result.solved && entry && entry.puzzleId === result.puzzleId && entry.solvedAt === null) {
      const solvedEntry = { ...entry, solvedAt: Date.now() };
      await repo.saveDaily(solvedEntry);
      set((s) => ({ daily: s.daily.map((d) => (d.day === today ? solvedEntry : d)) }));
    }
  },

  async ensureDaily() {
    const today = dayKey();
    const { daily, puzzles, stats } = get();
    const existing = daily.find((d) => d.day === today);
    if (existing && puzzles.some((p) => p.id === existing.puzzleId)) return existing;
    const playable = puzzles.filter((p) => p.solutions.some((s) => s.moves.some((m) => !m.auto)));
    const solvedIds = new Set(Object.entries(stats).filter(([, s]) => s.solved).map(([id]) => id));
    const puzzleId = pickDaily(today, playable.map((p) => p.id), daily, solvedIds);
    if (!puzzleId) return null;
    const entry: DailyEntry = { day: today, puzzleId, solvedAt: null };
    await repo.saveDaily(entry);
    set((s) => ({ daily: [...s.daily.filter((d) => d.day !== today), entry] }));
    return entry;
  },
}));

export function usePuzzle(id: string | undefined): Puzzle | undefined {
  return usePuzzles((s) => s.puzzles.find((p) => p.id === id));
}

/** Rated: first attempt at a puzzle you did not build yourself. */
export function isRatedAttempt(puzzle: Puzzle, stats: Record<string, PuzzleStats>): boolean {
  return puzzle.source !== 'user' && (stats[puzzle.id]?.attempts ?? 0) === 0;
}

export function todaysDaily(daily: DailyEntry[]): DailyEntry | undefined {
  return daily.find((d) => d.day === dayKey());
}

export function currentStreak(daily: DailyEntry[]): number {
  return dailyStreak(daily, dayKey());
}
