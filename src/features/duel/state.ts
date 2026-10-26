import { createId } from '@/lib/id';

import { SLOT_COUNTS, START_LP, type CardInstance, type DuelMove, type DuelState, type Location, type PileZone, type Side, type SideState, type SlotZone, type ZoneType } from './types';

export const PILE_ZONES: PileZone[] = ['hand', 'gy', 'banished', 'deck', 'extra'];
export const SLOT_ZONES: SlotZone[] = ['monster', 'spell', 'field', 'emz'];
const ALL_ZONES: ZoneType[] = ['hand', 'monster', 'emz', 'spell', 'field', 'gy', 'banished', 'deck', 'extra'];

export function isSlotZone(zone: ZoneType): zone is SlotZone {
  return (SLOT_ZONES as ZoneType[]).includes(zone);
}

export function other(side: Side): Side {
  return side === 'me' ? 'opp' : 'me';
}

export function emptySide(lp = START_LP): SideState {
  return {
    lp,
    hand: [],
    monster: Array(SLOT_COUNTS.monster).fill(null),
    spell: Array(SLOT_COUNTS.spell).fill(null),
    field: Array(SLOT_COUNTS.field).fill(null),
    gy: [],
    banished: [],
    deck: [],
    extra: [],
  };
}

export function emptyDuel(): DuelState {
  return { me: emptySide(), opp: emptySide(), emz: [null, null] };
}

export function newInstance(cardId: number, owner: Side, options: Partial<CardInstance> = {}): CardInstance {
  return { uid: createId(), cardId, owner, faceUp: true, defense: false, atk: null, def: null, materials: [], revealed: owner === 'me', ...options };
}

export function cloneDuel(state: DuelState): DuelState {
  return JSON.parse(JSON.stringify(state)) as DuelState;
}

/** The array behind a location (slot zones keep fixed-length arrays with nulls). */
export function zoneArray(state: DuelState, loc: Pick<Location, 'side' | 'zone'>): (CardInstance | null)[] {
  if (loc.zone === 'emz') return state.emz;
  return state[loc.side][loc.zone];
}

/** Cards in a zone; for the EMZ only those controlled by `side`. */
export function cardsIn(state: DuelState, loc: Pick<Location, 'side' | 'zone'>): CardInstance[] {
  const arr = zoneArray(state, loc).filter((c): c is CardInstance => c !== null);
  return loc.zone === 'emz' ? arr.filter((c) => c.owner === loc.side) : arr;
}

/** Finds a card instance anywhere on the board. */
export function locate(state: DuelState, uid: string): { loc: Location; card: CardInstance } | null {
  for (const side of ['me', 'opp'] as Side[]) {
    for (const zone of ALL_ZONES) {
      if (zone === 'emz') continue;
      const arr = zoneArray(state, { side, zone });
      const index = arr.findIndex((c) => c?.uid === uid);
      if (index >= 0) return { loc: { side, zone, index }, card: arr[index]! };
    }
  }
  const index = state.emz.findIndex((c) => c?.uid === uid);
  if (index >= 0) return { loc: { side: state.emz[index]!.owner, zone: 'emz', index }, card: state.emz[index]! };
  return null;
}

/** Index of a card with `cardId` in a zone, preferring `loc.index`. */
function findIndex(state: DuelState, loc: Location, cardId: number): number {
  const arr = zoneArray(state, loc);
  if (loc.index !== undefined && arr[loc.index]?.cardId === cardId) return loc.index;
  return arr.findIndex((c) => c !== null && c.cardId === cardId && (loc.zone !== 'emz' || c.owner === loc.side));
}

function removeAt(state: DuelState, loc: Location, index: number): CardInstance {
  const arr = zoneArray(state, loc);
  const card = arr[index]!;
  if (isSlotZone(loc.zone)) arr[index] = null;
  else arr.splice(index, 1);
  return card;
}

/**
 * Removes a card from a location. If it is not there, the same card is taken
 * from anywhere on that side; unknown cards (e.g. deck contents that were not
 * entered) are created, so recorded moves always replay.
 */
function take(state: DuelState, loc: Location, cardId: number): CardInstance {
  const index = findIndex(state, loc, cardId);
  if (index >= 0) return removeAt(state, loc, index);
  for (const zone of ALL_ZONES) {
    const alt: Location = { side: loc.side, zone };
    const i = findIndex(state, alt, cardId);
    if (i >= 0) return removeAt(state, alt, i);
  }
  return newInstance(cardId, loc.side);
}

/** First free slot in a slot zone, or -1. */
export function freeSlot(state: DuelState, loc: Pick<Location, 'side' | 'zone'>): number {
  return zoneArray(state, loc).findIndex((c) => c === null);
}

/** Places a card; returns false if the slot zone is full. */
function put(state: DuelState, loc: Location, card: CardInstance, fromPublic: boolean): boolean {
  if (isSlotZone(loc.zone)) {
    const arr = zoneArray(state, loc);
    const index = loc.index !== undefined && arr[loc.index] === null ? loc.index : freeSlot(state, loc);
    if (index < 0) {
      // A full Extra Monster Zone falls back to the Main Monster Zone.
      return loc.zone === 'emz' ? put(state, { side: loc.side, zone: 'monster' }, card, fromPublic) : false;
    }
    if (loc.zone === 'emz') card.owner = loc.side;
    arr[index] = card;
    return true;
  }
  // Cards leaving the field lose position and stat changes.
  card.atk = null;
  card.def = null;
  card.defense = false;
  card.faceUp = true;
  if (loc.zone === 'hand') card.revealed = card.owner === 'me' || fromPublic;
  zoneArray(state, loc).push(card);
  return true;
}

/** Sends attached Xyz materials to their owner's GY when the card leaves the field. */
function detachMaterials(state: DuelState, card: CardInstance, toZone: ZoneType | null) {
  if (card.materials.length === 0 || (toZone !== null && isSlotZone(toZone))) return;
  for (const material of card.materials) state[material.owner].gy.push({ ...material, faceUp: true });
  card.materials = [];
}

const isPublic = (zone: ZoneType) => zone !== 'deck' && zone !== 'hand';

/** Applies a move and returns the new state (the input is not modified). */
export function applyMove(input: DuelState, move: DuelMove): DuelState {
  const state = cloneDuel(input);
  const attached: CardInstance[] = [];

  for (const target of move.targets) {
    if (target.attach) {
      const card = take(state, target.from, target.cardId);
      detachMaterials(state, card, null);
      attached.push({ ...card, faceUp: true, defense: false });
    } else if (target.to) {
      const card = take(state, target.from, target.cardId);
      detachMaterials(state, card, target.to.zone);
      if (!put(state, target.to, card, isPublic(target.from.zone))) put(state, target.from, card, false);
      if (target.faceUp !== undefined && isSlotZone(target.to.zone)) card.faceUp = target.faceUp;
    } else if (target.faceUp !== undefined) {
      const index = findIndex(state, target.from, target.cardId);
      const card = index >= 0 ? zoneArray(state, target.from)[index] : null;
      if (card) card.faceUp = target.faceUp;
    }
  }

  let card: CardInstance | null = null;
  if (move.to) {
    card = take(state, move.from, move.cardId);
    detachMaterials(state, card, move.to.zone);
    // A full zone keeps the card where it was instead of losing it.
    const placed = put(state, move.to, card, isPublic(move.from.zone)) || put(state, move.from, card, false);
    if (!placed || !isSlotZone(move.to.zone)) card = null;
  } else {
    const index = findIndex(state, move.from, move.cardId);
    card = index >= 0 ? zoneArray(state, move.from)[index] : null;
  }
  if (card) {
    if (move.faceUp !== undefined) card.faceUp = move.faceUp;
    if (move.defense !== undefined) card.defense = move.defense;
    card.materials.push(...attached);
  }

  if (move.lp) {
    state.me.lp = Math.max(0, state.me.lp + move.lp.me);
    state.opp.lp = Math.max(0, state.opp.lp + move.lp.opp);
  }
  return state;
}

export function applyMoves(state: DuelState, moves: DuelMove[]): DuelState {
  return moves.reduce(applyMove, state);
}

/** All cards currently on the field (both sides, including the EMZ). */
export function fieldCards(state: DuelState, side?: Side): { loc: Location; card: CardInstance }[] {
  const result: { loc: Location; card: CardInstance }[] = [];
  for (const s of side ? [side] : (['me', 'opp'] as Side[])) {
    for (const zone of ['monster', 'spell', 'field'] as const) {
      state[s][zone].forEach((card, index) => {
        if (card) result.push({ loc: { side: s, zone, index }, card });
      });
    }
    state.emz.forEach((card, index) => {
      if (card && card.owner === s) result.push({ loc: { side: s, zone: 'emz', index }, card });
    });
  }
  return result;
}

/** Monsters (Main + Extra Monster Zone) controlled by a side. */
export function monstersOf(state: DuelState, side: Side): { loc: Location; card: CardInstance }[] {
  return fieldCards(state, side).filter((f) => f.loc.zone === 'monster' || f.loc.zone === 'emz');
}

/**
 * Editor setup: moves a card instance to a location without recording a move.
 * The card then belongs to the side it was placed on. A taken slot leaves
 * the card where it was.
 */
export function relocate(input: DuelState, uid: string, target: Location): DuelState {
  const found = locate(input, uid);
  if (!found) return input;
  if (isSlotZone(target.zone)) {
    const arr = zoneArray(input, target);
    const index = target.index !== undefined ? target.index : freeSlot(input, target);
    if (index < 0 || (arr[index] !== null && arr[index]?.uid !== uid)) return input;
  }
  const state = cloneDuel(input);
  const { loc } = found;
  const card = removeAt(state, loc, loc.index!);
  const moved = card.owner !== target.side;
  card.owner = target.side;
  if (moved) card.revealed = target.side === 'me';
  if (isSlotZone(target.zone)) {
    const arr = zoneArray(state, target);
    arr[target.index !== undefined ? target.index : freeSlot(state, target)] = card;
  } else {
    detachMaterials(state, card, target.zone);
    card.atk = null;
    card.def = null;
    card.defense = false;
    card.faceUp = true;
    zoneArray(state, target).push(card);
  }
  return state;
}

/** Editor setup: removes a card instance from the board. */
export function removeInstance(input: DuelState, uid: string): DuelState {
  const found = locate(input, uid);
  if (!found) return input;
  const state = cloneDuel(input);
  removeAt(state, found.loc, found.loc.index!);
  return state;
}

/** Editor setup: changes position, face, stats or visibility of a card. */
export function updateInstance(input: DuelState, uid: string, patch: Partial<Pick<CardInstance, 'faceUp' | 'defense' | 'atk' | 'def' | 'revealed'>>): DuelState {
  const state = cloneDuel(input);
  const found = locate(state, uid);
  if (found) Object.assign(found.card, patch);
  return state;
}

/** Every passcode used on the board (including Xyz materials). */
export function boardCardIds(state: DuelState): number[] {
  const ids = new Set<number>();
  const add = (card: CardInstance | null) => {
    if (!card) return;
    ids.add(card.cardId);
    card.materials.forEach(add);
  };
  for (const side of ['me', 'opp'] as Side[]) {
    for (const zone of ALL_ZONES) if (zone !== 'emz') zoneArray(state, { side, zone }).forEach(add);
  }
  state.emz.forEach(add);
  return [...ids];
}

/** The instance a recorded location refers to (exact index first, then any copy in that zone). */
export function findCard(state: DuelState, loc: Location, cardId: number): CardInstance | null {
  const index = findIndex(state, loc, cardId);
  return index >= 0 ? zoneArray(state, loc)[index] : null;
}
