import type { Difficulty, PlayerRating } from './types';

export const START_RATING = 1000;
export const MIN_RATING = 100;

export const DIFFICULTY_RATING: Record<Difficulty, number> = { 1: 600, 2: 900, 3: 1200, 4: 1500, 5: 1800 };

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: 'Anfänger',
  2: 'Leicht',
  3: 'Mittel',
  4: 'Schwer',
  5: 'Experte',
};

export const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];

export function newPlayerRating(): PlayerRating {
  return { rating: START_RATING, games: 0, best: START_RATING };
}

/** Elo win expectancy of the player against the puzzle. */
export function expectedScore(player: number, puzzle: number): number {
  return 1 / (1 + 10 ** ((puzzle - player) / 400));
}

/** Larger steps while the rating is still provisional. */
export function kFactor(games: number): number {
  return games < 20 ? 40 : 24;
}

export const PUZZLE_K = 16;

/**
 * Elo update after a rated attempt: score 1 = solved without mistakes or
 * hints, 0 otherwise. The puzzle's rating moves the opposite way.
 */
export function rate(player: PlayerRating, puzzleRating: number, solved: boolean): { player: PlayerRating; puzzleRating: number; delta: number } {
  const expected = expectedScore(player.rating, puzzleRating);
  const score = solved ? 1 : 0;
  const delta = Math.round(kFactor(player.games) * (score - expected));
  const rating = Math.max(MIN_RATING, player.rating + delta);
  return {
    player: { rating, games: player.games + 1, best: Math.max(player.best, rating) },
    puzzleRating: Math.max(MIN_RATING, Math.round(puzzleRating + PUZZLE_K * (expected - score))),
    delta: rating - player.rating,
  };
}

/** Difficulty level whose base rating is closest. */
export function difficultyForRating(rating: number): Difficulty {
  let best: Difficulty = 1;
  for (const d of DIFFICULTIES) if (Math.abs(DIFFICULTY_RATING[d] - rating) < Math.abs(DIFFICULTY_RATING[best] - rating)) best = d;
  return best;
}
