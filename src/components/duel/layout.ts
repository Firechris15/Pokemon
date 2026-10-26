import type { Location, PileZone, Side } from '@/features/duel/types';
import { CARD_ASPECT } from '@/theme';

export type Rect = { x: number; y: number; w: number; h: number };

export type ZoneSpot = { key: string; loc: Location; rect: Rect; kind: 'slot' | 'pile' | 'hand'; label: string };

export type BoardLayout = {
  width: number;
  height: number;
  cell: number;
  /** Card width inside a zone (portrait). */
  cardW: number;
  handCardW: number;
  lp: Record<Side, Rect>;
  hand: Record<Side, Rect>;
  spots: ZoneSpot[];
};

const COLUMNS = 7;
const HAND_RATIO = 0.8;
const LP_HEIGHT = 26;

const PILE_LABELS: Record<PileZone, string> = { hand: 'Hand', gy: 'Friedhof', banished: 'Verbannt', deck: 'Deck', extra: 'Extra' };

/**
 * Playmat layout (7 columns): the opponent's half is point-mirrored like on
 * a real table. Rows from the top: opponent LP, hand, Spell/Trap row,
 * Monster row, Extra Monster Zones (with both banished piles), your Monster
 * row, Spell/Trap row, hand, LP.
 */
export function computeLayout(availableWidth: number, availableHeight: number): BoardLayout {
  const cell = Math.max(24, Math.floor(Math.min(availableWidth / COLUMNS, (availableHeight - 2 * LP_HEIGHT) / (5 + 2 * HAND_RATIO))));
  const handH = Math.round(cell * HAND_RATIO);
  const width = cell * COLUMNS;
  const spots: ZoneSpot[] = [];
  const at = (col: number, row: number): Rect => ({ x: col * cell, y: row, w: cell, h: cell });

  const yOppHand = LP_HEIGHT;
  const yOppBack = yOppHand + handH;
  const yOppFront = yOppBack + cell;
  const yEmz = yOppFront + cell;
  const yMyFront = yEmz + cell;
  const yMyBack = yMyFront + cell;
  const yMyHand = yMyBack + cell;
  const height = yMyHand + handH + LP_HEIGHT;

  const slot = (side: Side, zone: Location['zone'], index: number, rect: Rect, label = '') =>
    spots.push({ key: `${side}-${zone}-${index}`, loc: { side, zone, index }, rect, kind: 'slot', label });
  const pile = (side: Side, zone: PileZone, rect: Rect) => spots.push({ key: `${side}-${zone}`, loc: { side, zone }, rect, kind: 'pile', label: PILE_LABELS[zone] });

  // Opponent (mirrored: their zone 0 is on our right).
  pile('opp', 'deck', at(0, yOppBack));
  for (let i = 0; i < 5; i++) slot('opp', 'spell', i, at(5 - i, yOppBack));
  pile('opp', 'extra', at(6, yOppBack));
  pile('opp', 'gy', at(0, yOppFront));
  for (let i = 0; i < 5; i++) slot('opp', 'monster', i, at(5 - i, yOppFront));
  slot('opp', 'field', 0, at(6, yOppFront), 'Feld');

  // Shared Extra Monster Zones between the halves.
  pile('opp', 'banished', at(0, yEmz));
  slot('me', 'emz', 0, at(2, yEmz), 'EMZ');
  slot('me', 'emz', 1, at(4, yEmz), 'EMZ');
  pile('me', 'banished', at(6, yEmz));

  // Player.
  slot('me', 'field', 0, at(0, yMyFront), 'Feld');
  for (let i = 0; i < 5; i++) slot('me', 'monster', i, at(i + 1, yMyFront));
  pile('me', 'gy', at(6, yMyFront));
  pile('me', 'extra', at(0, yMyBack));
  for (let i = 0; i < 5; i++) slot('me', 'spell', i, at(i + 1, yMyBack));
  pile('me', 'deck', at(6, yMyBack));

  const hand: Record<Side, Rect> = { opp: { x: 0, y: yOppHand, w: width, h: handH }, me: { x: 0, y: yMyHand, w: width, h: handH } };
  spots.push({ key: 'opp-hand', loc: { side: 'opp', zone: 'hand' }, rect: hand.opp, kind: 'hand', label: 'Hand' });
  spots.push({ key: 'me-hand', loc: { side: 'me', zone: 'hand' }, rect: hand.me, kind: 'hand', label: 'Hand' });

  return {
    width,
    height,
    cell,
    cardW: Math.round(cell * 0.64),
    handCardW: Math.round(handH * 0.9 * CARD_ASPECT),
    lp: { opp: { x: 0, y: 0, w: width, h: LP_HEIGHT }, me: { x: 0, y: yMyHand + handH, w: width, h: LP_HEIGHT } },
    hand,
    spots,
  };
}

/** Left edges of hand cards: centred, overlapping when the row is full. */
export function handPositions(count: number, row: Rect, cardW: number, gap = 4): number[] {
  if (count === 0) return [];
  const total = count * cardW + (count - 1) * gap;
  if (total <= row.w) {
    const start = row.x + (row.w - total) / 2;
    return Array.from({ length: count }, (_, i) => start + i * (cardW + gap));
  }
  const step = (row.w - cardW) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, i) => row.x + i * step);
}

/** Index of the zone under a point (board coordinates), or -1. Runs on the UI thread while dragging. */
export function hitTest(rects: Rect[], x: number, y: number): number {
  'worklet';
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}
