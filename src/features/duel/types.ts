/**
 * Manual duel model used by puzzles (Phase 4). It tracks where cards are,
 * but does not enforce game rules – that is the job of the rules engine in
 * Phase 5. Moves are recorded and compared, not validated.
 */

export type Side = 'me' | 'opp';

export type PileZone = 'hand' | 'gy' | 'banished' | 'deck' | 'extra';
export type SlotZone = 'monster' | 'spell' | 'field' | 'emz';
export type ZoneType = PileZone | SlotZone;

/** For the shared Extra Monster Zones, `side` is the controller. */
export type Location = { side: Side; zone: ZoneType; index?: number };

export type CardInstance = {
  uid: string;
  cardId: number;
  owner: Side;
  faceUp: boolean;
  defense: boolean;
  /** Manually adjusted ATK/DEF (null = printed value). */
  atk: number | null;
  def: number | null;
  /** Xyz materials attached to this card. */
  materials: CardInstance[];
  /** Opponent hand cards: known to the player? */
  revealed: boolean;
};

export type SideState = {
  lp: number;
  hand: CardInstance[];
  monster: (CardInstance | null)[];
  spell: (CardInstance | null)[];
  field: (CardInstance | null)[];
  gy: CardInstance[];
  banished: CardInstance[];
  deck: CardInstance[];
  extra: CardInstance[];
};

export type DuelState = {
  me: SideState;
  opp: SideState;
  /** Two shared Extra Monster Zones (left, right from the player's view). */
  emz: (CardInstance | null)[];
};

export type MoveAction =
  | 'normal_summon'
  | 'special_summon'
  | 'set'
  | 'flip'
  | 'activate'
  | 'link_summon'
  | 'xyz_summon'
  | 'synchro_summon'
  | 'fusion_summon'
  | 'ritual_summon'
  | 'attack'
  | 'direct_attack'
  | 'change_position'
  | 'destroy'
  | 'send_gy'
  | 'discard'
  | 'banish'
  | 'to_hand'
  | 'to_deck'
  | 'take_control'
  | 'damage';

export type MoveTarget = {
  cardId: number;
  from: Location;
  /** null = the card stays where it is. */
  to: Location | null;
  /** Attach as Xyz material to the moving card. */
  attach?: boolean;
  faceUp?: boolean;
};

export type DuelMove = {
  id: string;
  actor: Side;
  action: MoveAction;
  cardId: number;
  from: Location;
  /** null = the card stays where it is (e.g. activating a monster effect on the field). */
  to: Location | null;
  faceUp?: boolean;
  defense?: boolean;
  targets: MoveTarget[];
  /** Life point change caused by the move (negative = damage). */
  lp?: { me: number; opp: number };
  /** Played automatically when solving (opponent responses, effect resolution). */
  auto: boolean;
  /** May be played in any order together with the neighbouring unordered moves. */
  unordered?: boolean;
  note: string;
};

export const SLOT_COUNTS: Record<SlotZone, number> = { monster: 5, spell: 5, field: 1, emz: 2 };

export const START_LP = 8000;
