import { BOARD_ZONES, type BoardZone } from './actions';
import type { Combo, ComboStep, Zone } from './types';

export type BoardState = Record<BoardZone, number[]>;

const TRACKED = BOARD_ZONES;

function emptyBoard(hand: number[]): BoardState {
  return { hand: [...hand], field: [], gy: [], banished: [], material: [] };
}

/** Moves one copy of a card to a zone; cards not on the board come from the deck. */
function move(board: BoardState, cardId: number, to: Zone | null) {
  if (to === null) return;
  for (const zone of TRACKED) {
    const index = board[zone].indexOf(cardId);
    if (index >= 0) {
      board[zone].splice(index, 1);
      break;
    }
  }
  if (to !== 'deck' && to !== 'extra') board[to].push(cardId);
}

export function applyStep(board: BoardState, step: ComboStep): BoardState {
  const next: BoardState = {
    hand: [...board.hand],
    field: [...board.field],
    gy: [...board.gy],
    banished: [...board.banished],
    material: [...board.material],
  };
  // Materials/costs leave before the summoned card arrives (e.g. Link Summon).
  for (const target of step.targets) move(next, target, step.targetsTo);
  move(next, step.cardId, step.cardTo);
  return next;
}

/** Board after the first `stepCount` steps of a combo. */
export function boardAfter(combo: Pick<Combo, 'startingHand' | 'steps'>, stepCount: number): BoardState {
  let board = emptyBoard(combo.startingHand);
  for (const step of combo.steps.slice(0, stepCount)) board = applyStep(board, step);
  return board;
}

/** All cards currently on the board (hand, field, GY, banished, materials). */
export function cardsOnBoard(board: BoardState): number[] {
  return TRACKED.flatMap((zone) => board[zone]);
}
