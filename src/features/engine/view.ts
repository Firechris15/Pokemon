import type { CardInstance, DuelState, Side, SideState } from '@/features/duel/types';

import { isDefense, isFaceUp, Loc } from './ocg';
import type { CardView, Player, PlayerView, Snapshot } from './types';

/** Board uids encode the engine location: "controller:location:sequence". */
export function engineUid(controller: Player, location: number, sequence: number): string {
  return `${controller}:${location}:${sequence}`;
}

export function parseEngineUid(uid: string): { controller: Player; location: number; sequence: number } | null {
  const [c, l, s] = uid.split(':').map(Number);
  if (!Number.isFinite(c) || !Number.isFinite(l) || !Number.isFinite(s)) return null;
  return { controller: c as Player, location: l, sequence: s };
}

function instance(card: CardView, side: Side): CardInstance {
  const uid = engineUid(card.controller, card.location, card.sequence);
  return {
    uid,
    cardId: card.code,
    owner: side,
    faceUp: isFaceUp(card.position) || (card.location !== Loc.MZONE && card.location !== Loc.SZONE),
    defense: isDefense(card.position),
    atk: card.attack !== null && card.baseAttack !== null && card.attack !== card.baseAttack ? card.attack : null,
    def: card.defense !== null && card.baseDefense !== null && card.defense !== card.baseDefense ? card.defense : null,
    materials: card.materials.map((code, i) => ({
      uid: `${uid}:m${i}`,
      cardId: code,
      owner: side,
      faceUp: true,
      defense: false,
      atk: null,
      def: null,
      materials: [],
      revealed: true,
    })),
    revealed: card.code !== 0,
  };
}

function side(view: PlayerView, s: Side, player: Player): SideState {
  const slot = (c: CardView | null) => (c ? instance(c, s) : null);
  return {
    lp: view.lp,
    hand: view.hand.map((c) => instance(c, s)),
    monster: view.mzone.slice(0, 5).map(slot),
    spell: view.szone.slice(0, 5).map(slot),
    field: [slot(view.szone[5] ?? null)],
    gy: view.grave.map((c) => instance(c, s)),
    banished: view.removed.map((c) => instance(c, s)),
    extra: view.extra.map((c) => instance(c, s)),
    deck: Array.from({ length: view.deckCount }, (_, i) => ({
      uid: engineUid(player, Loc.DECK, i),
      cardId: 0,
      owner: s,
      faceUp: false,
      defense: false,
      atk: null,
      def: null,
      materials: [],
      revealed: false,
    })),
  };
}

/**
 * The engine's field as the board model of Phase 4: "me" is the viewer.
 * The Extra Monster Zones are shared: the viewer's zone 5 is the left one,
 * the opponent's zone 5 the right one (seen from the viewer).
 */
export function snapshotToDuelState(snapshot: Snapshot): DuelState {
  const me = snapshot.viewer;
  const opp = (1 - me) as Player;
  const mine = snapshot.players[me];
  const theirs = snapshot.players[opp];
  const emz = (c: CardView | null, s: Side) => (c ? instance(c, s) : null);
  return {
    me: side(mine, 'me', me),
    opp: side(theirs, 'opp', opp),
    emz: [emz(mine.mzone[5] ?? null, 'me') ?? emz(theirs.mzone[6] ?? null, 'opp'), emz(mine.mzone[6] ?? null, 'me') ?? emz(theirs.mzone[5] ?? null, 'opp')],
  };
}

/** Engine location of a board zone the player dropped a card on. */
export function boardTarget(target: { side: Side; zone: string; index?: number }, viewer: Player): { controller: Player; location: number; sequence: number } | null {
  const controller = (target.side === 'me' ? viewer : 1 - viewer) as Player;
  switch (target.zone) {
    case 'monster':
      return { controller, location: Loc.MZONE, sequence: target.index ?? 0 };
    case 'emz':
      // Seen from the viewer: left EMZ = own zone 5 = opponent zone 6.
      return target.side === 'me'
        ? { controller, location: Loc.MZONE, sequence: 5 + (target.index ?? 0) }
        : { controller, location: Loc.MZONE, sequence: 6 - (target.index ?? 0) };
    case 'spell':
      return { controller, location: Loc.SZONE, sequence: target.index ?? 0 };
    case 'field':
      return { controller, location: Loc.SZONE, sequence: 5 };
    case 'hand':
      return { controller, location: Loc.HAND, sequence: 0 };
    case 'gy':
      return { controller, location: Loc.GRAVE, sequence: 0 };
    case 'banished':
      return { controller, location: Loc.REMOVED, sequence: 0 };
    case 'deck':
      return { controller, location: Loc.DECK, sequence: 0 };
    case 'extra':
      return { controller, location: Loc.EXTRA, sequence: 0 };
    default:
      return null;
  }
}

/** Turns a revealed replay snapshot back into what the viewer saw: hidden cards become unknown. */
export function maskHidden(snapshot: Snapshot): Snapshot {
  const mask = (c: CardView): CardView =>
    c.hidden ? { ...c, code: 0, type: 0, attack: null, defense: null, baseAttack: null, baseDefense: null, materials: c.materials.map(() => 0) } : c;
  const player = (p: PlayerView): PlayerView => ({
    ...p,
    hand: p.hand.map(mask),
    mzone: p.mzone.map((c) => c && mask(c)),
    szone: p.szone.map((c) => c && mask(c)),
    grave: p.grave.map(mask),
    removed: p.removed.map(mask),
    extra: p.extra.map(mask),
  });
  return { ...snapshot, players: [player(snapshot.players[0]), player(snapshot.players[1])] };
}
