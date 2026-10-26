import { movesMatch } from '@/features/duel/moves';
import { applyMove, applyMoves, boardCardIds, cloneDuel } from '@/features/duel/state';
import type { DuelMove, DuelState } from '@/features/duel/types';

import type { Puzzle } from './types';

/**
 * A player move together with the automatic moves that follow it (opponent
 * responses, effect resolution). Leading automatic moves form a unit
 * without a player move.
 */
export type Unit = { lead: DuelMove | null; followers: DuelMove[]; unordered: boolean };

export function toUnits(moves: DuelMove[]): Unit[] {
  const units: Unit[] = [];
  for (const move of moves) {
    if (move.auto) {
      if (units.length === 0) units.push({ lead: null, followers: [], unordered: false });
      units[units.length - 1].followers.push(move);
    } else {
      units.push({ lead: move, followers: [], unordered: Boolean(move.unordered) });
    }
  }
  return units;
}

/** Units that may be played next: the first open one, or every open one in its unordered run. */
export function nextUnits(units: Unit[], done: boolean[]): number[] {
  const first = done.findIndex((d) => !d);
  if (first < 0) return [];
  if (!units[first].unordered) return [first];
  const result: number[] = [];
  for (let i = first; i < units.length && units[i].unordered; i++) if (!done[i]) result.push(i);
  return result;
}

type Candidate = { solution: number; done: boolean[] };

export type SolveStatus = 'playing' | 'solved' | 'revealed';

export type SolveSession = {
  state: DuelState;
  history: DuelMove[];
  /** Solutions that are still consistent with the moves played so far. */
  candidates: Candidate[];
  mistakes: number;
  hints: number;
  status: SolveStatus;
};

function playableSolutions(puzzle: Puzzle): number[] {
  return puzzle.solutions.map((s, i) => (s.moves.some((m) => !m.auto) ? i : -1)).filter((i) => i >= 0);
}

function unitsOf(puzzle: Puzzle, candidate: Candidate): Unit[] {
  return toUnits(puzzle.solutions[candidate.solution].moves);
}

function sameMoves(a: DuelMove[], b: DuelMove[]): boolean {
  return a.length === b.length && a.every((m, i) => movesMatch(m, b[i]));
}

function isComplete(puzzle: Puzzle, session: Pick<SolveSession, 'state' | 'candidates'>): boolean {
  if (puzzle.goal === 'lethal' && session.state.opp.lp <= 0) return true;
  return session.candidates.some((c) => c.done.every(Boolean));
}

/** Starts solving: plays automatic opening moves (e.g. an opponent action before your turn). */
export function startSession(puzzle: Puzzle): SolveSession {
  let state = cloneDuel(puzzle.initial);
  const history: DuelMove[] = [];
  const candidates: Candidate[] = playableSolutions(puzzle).map((solution) => ({
    solution,
    done: toUnits(puzzle.solutions[solution].moves).map(() => false),
  }));
  const first = candidates[0];
  if (first) {
    const opening = unitsOf(puzzle, first)[0];
    if (opening && opening.lead === null) {
      state = applyMoves(state, opening.followers);
      history.push(...opening.followers);
      for (const candidate of candidates) {
        const units = unitsOf(puzzle, candidate);
        if (units[0]?.lead === null && sameMoves(units[0].followers, opening.followers)) candidate.done[0] = true;
      }
    }
  }
  return { state, history, candidates: candidates.filter((c) => !first || c.done[0] === first.done[0]), mistakes: 0, hints: 0, status: 'playing' };
}

export type TryResult = { session: SolveSession; correct: boolean; auto: DuelMove[] };

/** Checks a player move against the solutions; wrong moves are not played. */
export function tryMove(puzzle: Puzzle, session: SolveSession, move: DuelMove): TryResult {
  if (session.status !== 'playing') return { session, correct: false, auto: [] };
  const matches: { candidate: Candidate; unit: Unit; index: number }[] = [];
  for (const candidate of session.candidates) {
    const units = unitsOf(puzzle, candidate);
    const index = nextUnits(units, candidate.done).find((i) => movesMatch(units[i].lead!, move));
    if (index !== undefined) matches.push({ candidate, unit: units[index], index });
  }
  if (matches.length === 0) {
    return { session: { ...session, mistakes: session.mistakes + 1 }, correct: false, auto: [] };
  }
  const auto = matches[0].unit.followers;
  const state = applyMoves(applyMove(session.state, move), auto);
  const candidates = matches
    .filter((m) => sameMoves(m.unit.followers, auto))
    .map((m) => ({ solution: m.candidate.solution, done: m.candidate.done.map((d, i) => d || i === m.index) }));
  const next: SolveSession = { ...session, state, candidates, history: [...session.history, move, ...auto] };
  if (isComplete(puzzle, next)) next.status = 'solved';
  return { session: next, correct: true, auto };
}

/** The move the first remaining solution expects next. */
export function expectedMove(puzzle: Puzzle, session: SolveSession): DuelMove | null {
  const candidate = session.candidates[0];
  if (!candidate || session.status !== 'playing') return null;
  const units = unitsOf(puzzle, candidate);
  const index = nextUnits(units, candidate.done)[0];
  return index === undefined ? null : units[index].lead;
}

export function withHint(session: SolveSession): SolveSession {
  return { ...session, hints: session.hints + 1 };
}

/** Plays the next expected move for the player ("show solution" step by step). */
export function revealStep(puzzle: Puzzle, session: SolveSession): TryResult {
  const move = expectedMove(puzzle, session);
  if (!move) return { session, correct: false, auto: [] };
  const result = tryMove(puzzle, session, move);
  const status: SolveStatus = result.session.status === 'solved' ? 'revealed' : 'playing';
  return { ...result, session: { ...result.session, status, hints: Math.max(result.session.hints, 1) } };
}

/** Problems that make a puzzle unplayable; shown in the editor. */
export function validatePuzzle(puzzle: Puzzle): string[] {
  const problems: string[] = [];
  if (!puzzle.title.trim()) problems.push('Titel fehlt.');
  if (playableSolutions(puzzle).length === 0) problems.push('Es gibt noch keine Lösung mit eigenen Zügen.');
  for (const solution of puzzle.solutions) {
    const end = applyMoves(puzzle.initial, solution.moves);
    if (puzzle.goal === 'lethal' && end.opp.lp > 0 && solution.moves.length > 0) {
      problems.push(`„${solution.name}“ bringt die LP des Gegners nicht auf 0 (noch ${end.opp.lp}).`);
    }
  }
  return problems;
}

/** Every passcode a puzzle shows: the position and all solution moves. */
export function puzzleCardIds(puzzle: Puzzle): number[] {
  const ids = new Set(boardCardIds(puzzle.initial));
  for (const solution of puzzle.solutions) {
    for (const move of solution.moves) {
      ids.add(move.cardId);
      for (const target of move.targets) ids.add(target.cardId);
    }
  }
  return [...ids];
}
