import { buildMove, isError, type Intent } from '@/features/duel/builder';
import { locate, zoneArray } from '@/features/duel/state';
import type { DuelMove, DuelState, Location } from '@/features/duel/types';
import { decodePuzzle, encodePuzzle } from '@/features/puzzles/codec';
import { dailyStreak, dayKey, pickDaily, previousDay } from '@/features/puzzles/daily';
import { DIFFICULTY_RATING, difficultyForRating, expectedScore, kFactor, MIN_RATING, newPlayerRating, rate } from '@/features/puzzles/rating';
import { C, SAMPLE_CARD_IDS, samplePuzzles } from '@/features/puzzles/samples';
import { expectedMove, nextUnits, revealStep, startSession, toUnits, tryMove, validatePuzzle, type SolveSession } from '@/features/puzzles/solver';
import { isRatedAttempt } from '@/features/puzzles/store';
import type { DailyEntry, Puzzle } from '@/features/puzzles/types';

import { puzzleCardMap } from './helpers';

const cards = puzzleCardMap();
const cardOf = (id: number) => cards.get(id);
const sample = (id: string) => samplePuzzles().find((p) => p.id === id)!;

/** The uid of the card a recorded move refers to (as the board UI would hand it over). */
function uidAt(state: DuelState, loc: Location, cardId: number): string {
  const arr = zoneArray(state, loc);
  const exact = loc.index !== undefined ? arr[loc.index] : null;
  const card = exact?.cardId === cardId ? exact : arr.find((c) => c?.cardId === cardId && (loc.zone !== 'emz' || c.owner === loc.side));
  if (!card) throw new Error(`card ${cardId} not in ${loc.side}:${loc.zone}`);
  return card.uid;
}

/** Turns a recorded solution move into the intent a player would create on the board. */
function intentFor(state: DuelState, move: DuelMove): Intent {
  const uid = uidAt(state, move.from, move.cardId);
  const targetUids = move.targets.map((t) => uidAt(state, t.from, t.cardId));
  switch (move.action) {
    case 'activate':
      return { kind: 'activate', actor: move.actor, uid, targets: targetUids };
    case 'link_summon':
    case 'xyz_summon':
    case 'synchro_summon':
    case 'fusion_summon':
    case 'ritual_summon':
      return { kind: 'extra_summon', actor: move.actor, uid, action: move.action, materials: targetUids };
    case 'attack':
    case 'direct_attack':
      return { kind: 'attack', actor: move.actor, uid, targetUid: targetUids[0] ?? null };
    case 'damage':
      throw new Error('not used');
    default:
      return { kind: move.action, actor: move.actor, uid, defense: move.defense, tributes: targetUids };
  }
}

/** Plays a solution through the move builder, like a player on the board. */
function playThroughBuilder(puzzle: Puzzle, moves: DuelMove[]): SolveSession {
  let session = startSession(puzzle);
  for (const move of moves.filter((m) => !m.auto)) {
    const built = buildMove(session.state, intentFor(session.state, move), cardOf);
    if (isError(built)) throw new Error(`${puzzle.id}: ${built.error}`);
    const result = tryMove(puzzle, session, built);
    expect(result.correct).toBe(true);
    session = result.session;
  }
  return session;
}

describe('sample puzzles', () => {
  it('use only cards from the fixtures and are valid', () => {
    for (const id of SAMPLE_CARD_IDS) expect(cards.has(id)).toBe(true);
    for (const puzzle of samplePuzzles()) expect(validatePuzzle(puzzle)).toEqual([]);
  });

  it('can be solved on the board with every stored solution', () => {
    for (const puzzle of samplePuzzles()) {
      for (const solution of puzzle.solutions) {
        const session = playThroughBuilder(puzzle, solution.moves);
        expect(session.status).toBe('solved');
        expect(session.state.opp.lp).toBe(0);
        expect(session.mistakes).toBe(0);
      }
    }
  });

  it('accepts unordered attacks in any order', () => {
    const puzzle = sample('sample-mirror-force');
    const [mst, , dm, celtic] = puzzle.solutions[0].moves;
    const session = playThroughBuilder(puzzle, [mst, celtic, dm]);
    expect(session.status).toBe('solved');
  });

  it('rejects wrong moves without playing them', () => {
    const puzzle = sample('sample-raigeki');
    const session = startSession(puzzle);
    const blueEyes = session.state.me.monster[2]!;
    const skull = session.state.opp.monster[3]!;
    const attack = buildMove(session.state, { kind: 'attack', actor: 'me', uid: blueEyes.uid, targetUid: skull.uid }, cardOf) as DuelMove;
    const result = tryMove(puzzle, session, attack);
    expect(result.correct).toBe(false);
    expect(result.session.mistakes).toBe(1);
    expect(result.session.state).toBe(session.state);
  });

  it('plays opponent responses automatically and punishes the wrong order', () => {
    const puzzle = sample('sample-ash');
    const start = startSession(puzzle);
    const foolishFirst = buildMove(start.state, { kind: 'activate', actor: 'me', uid: start.state.me.hand[1].uid }, cardOf) as DuelMove;
    expect(tryMove(puzzle, start, foolishFirst).correct).toBe(false);
    const bait = buildMove(start.state, { kind: 'activate', actor: 'me', uid: start.state.me.hand[0].uid }, cardOf) as DuelMove;
    const result = tryMove(puzzle, start, bait);
    expect(result.correct).toBe(true);
    expect(result.auto.map((m) => m.cardId)).toEqual([C.ash]);
    expect(result.session.state.opp.hand).toHaveLength(0);
    expect(result.session.state.opp.gy.map((c) => c.cardId)).toEqual([C.ash]);
  });

  it('follows whichever of several solutions the player chooses', () => {
    const puzzle = sample('sample-change-of-heart');
    let session = playThroughBuilder(puzzle, puzzle.solutions[1].moves.slice(0, 2));
    expect(session.candidates).toHaveLength(2);
    const skull = locate(session.state, session.state.me.monster[0]!.uid)!;
    expect(skull.card.cardId).toBe(C.skull);
    const celtic = session.state.opp.monster[1]!;
    const attack = buildMove(session.state, { kind: 'attack', actor: 'me', uid: skull.card.uid, targetUid: celtic.uid }, cardOf) as DuelMove;
    session = tryMove(puzzle, session, attack).session;
    expect(session.candidates.map((c) => c.solution)).toEqual([1]);
    expect(expectedMove(puzzle, session)?.cardId).toBe(C.blueEyes);
  });

  it('reveals the solution step by step', () => {
    const puzzle = sample('sample-fusion');
    let session = startSession(puzzle);
    for (let i = 0; i < 3; i++) session = revealStep(puzzle, session).session;
    expect(session.status).toBe('revealed');
    expect(session.hints).toBeGreaterThan(0);
    expect(revealStep(puzzle, session).correct).toBe(false);
  });
});

describe('solver units', () => {
  const move = (id: string, auto = false, unordered = false): DuelMove => ({
    id,
    actor: 'me',
    action: 'activate',
    cardId: 1,
    from: { side: 'me', zone: 'hand' },
    to: null,
    targets: [],
    auto,
    unordered,
    note: '',
  });

  it('groups automatic moves with the move before them', () => {
    const units = toUnits([move('a', true), move('b'), move('c', true), move('d', false, true), move('e', false, true), move('f')]);
    expect(units.map((u) => [u.lead?.id ?? null, u.followers.map((f) => f.id)])).toEqual([
      [null, ['a']],
      ['b', ['c']],
      ['d', []],
      ['e', []],
      ['f', []],
    ]);
    expect(nextUnits(units, [true, true, false, false, false])).toEqual([2, 3]);
    expect(nextUnits(units, [true, true, false, true, false])).toEqual([2]);
    expect(nextUnits(units, [true, true, true, true, false])).toEqual([4]);
    expect(nextUnits(units, [true, true, true, true, true])).toEqual([]);
  });

  it('needs the whole sequence for sequence puzzles', () => {
    const puzzle = { ...sample('sample-raigeki'), goal: 'sequence' as const };
    puzzle.solutions = [{ ...puzzle.solutions[0], moves: [...puzzle.solutions[0].moves, { ...puzzle.solutions[0].moves[3], id: 'extra', action: 'change_position' as const, lp: undefined }] }];
    let session = startSession(puzzle);
    for (let i = 0; i < 2; i++) session = revealStep(puzzle, session).session;
    expect(session.state.opp.lp).toBe(0);
    expect(session.status).toBe('playing');
  });

  it('flags puzzles without a usable solution', () => {
    const puzzle = { ...sample('sample-raigeki'), solutions: [] };
    expect(validatePuzzle(puzzle)).toContain('Es gibt noch keine Lösung mit eigenen Zügen.');
    const short = sample('sample-raigeki');
    short.solutions[0].moves = short.solutions[0].moves.slice(0, 1);
    expect(validatePuzzle(short)[0]).toMatch(/nicht auf 0/);
  });
});

describe('rating', () => {
  it('computes Elo expectations', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1400, 1000)).toBeCloseTo(0.909, 3);
    expect(expectedScore(1000, 1400) + expectedScore(1400, 1000)).toBeCloseTo(1);
  });

  it('moves player and puzzle ratings in opposite directions', () => {
    const player = newPlayerRating();
    const win = rate(player, 1000, true);
    expect(win.delta).toBe(20);
    expect(win.player).toEqual({ rating: 1020, games: 1, best: 1020 });
    expect(win.puzzleRating).toBe(992);
    const loss = rate(player, 1000, false);
    expect(loss.delta).toBe(-20);
    expect(loss.player.best).toBe(1000);
    expect(loss.puzzleRating).toBe(1008);
  });

  it('uses smaller steps after the provisional phase and a minimum rating', () => {
    expect(kFactor(0)).toBe(40);
    expect(kFactor(25)).toBe(24);
    expect(rate({ rating: MIN_RATING, games: 30, best: 500 }, 3000, false).player.rating).toBe(MIN_RATING);
  });

  it('maps ratings to difficulty levels', () => {
    expect(difficultyForRating(DIFFICULTY_RATING[1])).toBe(1);
    expect(difficultyForRating(1290)).toBe(3);
    expect(difficultyForRating(2500)).toBe(5);
  });

  it('only rates the first attempt at puzzles you did not build', () => {
    const puzzle = sample('sample-raigeki');
    expect(isRatedAttempt(puzzle, {})).toBe(true);
    expect(isRatedAttempt(puzzle, { [puzzle.id]: { attempts: 1, solved: false, lastAt: 1 } })).toBe(false);
    expect(isRatedAttempt({ ...puzzle, source: 'user' }, {})).toBe(false);
  });
});

describe('daily puzzle', () => {
  it('formats local days and walks back across months and years', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });

  it('picks the same puzzle for the same day, preferring new ones', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(pickDaily('2026-10-26', ids, [], new Set())).toBe(pickDaily('2026-10-26', [...ids].reverse(), [], new Set()));
    const history: DailyEntry[] = [
      { day: '2026-10-24', puzzleId: 'a', solvedAt: 1 },
      { day: '2026-10-25', puzzleId: 'b', solvedAt: null },
    ];
    for (const day of ['2026-10-26', '2026-10-27', '2026-11-03']) {
      expect(pickDaily(day, ids, history, new Set(['c']))).toBe('d');
      expect(['c', 'd']).toContain(pickDaily(day, ids, history, new Set(['c', 'd'])));
    }
    expect(pickDaily('2026-10-26', [], [], new Set())).toBeNull();
  });

  it('counts the streak of solved days', () => {
    const entry = (day: string, solved: boolean): DailyEntry => ({ day, puzzleId: 'x', solvedAt: solved ? 1 : null });
    const history = [entry('2026-10-22', true), entry('2026-10-24', true), entry('2026-10-25', true), entry('2026-10-26', false)];
    expect(dailyStreak(history, '2026-10-26')).toBe(2);
    expect(dailyStreak([...history.slice(0, 3), entry('2026-10-26', true)], '2026-10-26')).toBe(3);
    expect(dailyStreak(history, '2026-10-28')).toBe(0);
  });
});

describe('puzzle codes', () => {
  it('round-trip a puzzle as text', () => {
    const puzzle = sample('sample-mirror-force');
    const decoded = decodePuzzle(`Schau mal: ${encodePuzzle(puzzle)}`, 5);
    if ('error' in decoded) throw new Error(decoded.error);
    expect(decoded).toMatchObject({ title: puzzle.title, difficulty: 2, source: 'import', createdAt: 5, initial: puzzle.initial, solutions: puzzle.solutions });
    expect(decoded.id).not.toBe(puzzle.id);
  });

  it('reports broken codes', () => {
    expect(decodePuzzle('hallo')).toHaveProperty('error');
    expect(decodePuzzle('ygo-puzzle:{"v":1')).toHaveProperty('error');
    expect(decodePuzzle('ygo-puzzle:{"v":1,"title":"x"}')).toHaveProperty('error');
  });
});
