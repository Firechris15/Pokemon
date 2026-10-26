import type { DuelMove, DuelState } from '@/features/duel/types';

/** lethal: solved as soon as the opponent's LP hit 0; sequence: the full solution must be played. */
export type PuzzleGoal = 'lethal' | 'sequence';

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type Solution = {
  id: string;
  name: string;
  moves: DuelMove[];
};

export type Puzzle = {
  id: string;
  title: string;
  /** Short task, e.g. "OTK" or "Durch Nibiru spielen". */
  task: string;
  /** Situation details shown before solving (known cards, opponent behaviour …). */
  description: string;
  /** Shown after the puzzle is solved or the solution was revealed. */
  explanation: string;
  goal: PuzzleGoal;
  difficulty: Difficulty;
  /** Puzzle Elo; starts at the difficulty's base rating and moves with results. */
  rating: number;
  initial: DuelState;
  solutions: Solution[];
  /** Own puzzles (user) are not rated – you know the answer. */
  source: 'sample' | 'user' | 'import';
  createdAt: number;
  updatedAt: number;
};

export type PlayerRating = { rating: number; games: number; best: number };

export type PuzzleResult = {
  puzzleId: string;
  solved: boolean;
  mistakes: number;
  hints: number;
  durationMs: number;
  /** Counted for the rating (first attempt only). */
  rated: boolean;
  ratingBefore: number | null;
  ratingAfter: number | null;
  daily: boolean;
};

export type PuzzleStats = { attempts: number; solved: boolean; lastAt: number | null };

export type DailyEntry = { day: string; puzzleId: string; solvedAt: number | null };
