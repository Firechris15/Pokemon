import type { DuelState } from '@/features/duel/types';
import { createId } from '@/lib/id';

import { DIFFICULTY_RATING } from './rating';
import type { Difficulty, Puzzle, Solution } from './types';

/**
 * Puzzles are shared as plain text: a prefix plus JSON. The text can be
 * copied into a message and pasted into the app on another device.
 */
const PREFIX = 'ygo-puzzle:';

type Shared = Pick<Puzzle, 'title' | 'task' | 'description' | 'explanation' | 'goal' | 'difficulty' | 'initial' | 'solutions'> & { v: 1 };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isDuelState(value: unknown): value is DuelState {
  if (!isObject(value) || !Array.isArray(value.emz)) return false;
  return (['me', 'opp'] as const).every((side) => {
    const s = value[side];
    return isObject(s) && typeof s.lp === 'number' && ['hand', 'monster', 'spell', 'field', 'gy', 'banished', 'deck', 'extra'].every((zone) => Array.isArray(s[zone]));
  });
}

function isSolution(value: unknown): value is Solution {
  return (
    isObject(value) &&
    Array.isArray(value.moves) &&
    value.moves.every((m) => isObject(m) && typeof m.cardId === 'number' && typeof m.action === 'string' && isObject(m.from) && Array.isArray(m.targets))
  );
}

export function encodePuzzle(puzzle: Puzzle): string {
  const shared: Shared = {
    v: 1,
    title: puzzle.title,
    task: puzzle.task,
    description: puzzle.description,
    explanation: puzzle.explanation,
    goal: puzzle.goal,
    difficulty: puzzle.difficulty,
    initial: puzzle.initial,
    solutions: puzzle.solutions,
  };
  return PREFIX + JSON.stringify(shared);
}

export function decodePuzzle(text: string, now = Date.now()): Puzzle | { error: string } {
  const start = text.indexOf(PREFIX);
  if (start < 0) return { error: 'Kein Puzzle-Code gefunden (er beginnt mit „ygo-puzzle:“).' };
  let shared: Partial<Shared>;
  try {
    shared = JSON.parse(text.slice(start + PREFIX.length).trim());
  } catch {
    return { error: 'Der Puzzle-Code ist unvollständig oder beschädigt.' };
  }
  const initial = shared.initial;
  if (!isDuelState(initial) || !Array.isArray(shared.solutions) || !shared.solutions.every(isSolution)) {
    return { error: 'Der Puzzle-Code enthält keine gültige Stellung.' };
  }
  const difficulty = Math.min(5, Math.max(1, Math.round(Number(shared.difficulty) || 3))) as Difficulty;
  return {
    id: createId(),
    title: String(shared.title ?? 'Importiertes Puzzle'),
    task: String(shared.task ?? ''),
    description: String(shared.description ?? ''),
    explanation: String(shared.explanation ?? ''),
    goal: shared.goal === 'sequence' ? 'sequence' : 'lethal',
    difficulty,
    rating: DIFFICULTY_RATING[difficulty],
    initial,
    solutions: shared.solutions,
    source: 'import',
    createdAt: now,
    updatedAt: now,
  };
}
