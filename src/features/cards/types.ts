export type FrameType =
  | 'normal'
  | 'effect'
  | 'ritual'
  | 'fusion'
  | 'synchro'
  | 'xyz'
  | 'link'
  | 'normal_pendulum'
  | 'effect_pendulum'
  | 'ritual_pendulum'
  | 'fusion_pendulum'
  | 'synchro_pendulum'
  | 'xyz_pendulum'
  | 'spell'
  | 'trap'
  | 'token'
  | 'skill';

export type CardClass = 'monster' | 'spell' | 'trap' | 'token' | 'skill';

export type BanStatus = 'Forbidden' | 'Limited' | 'Semi-Limited';

export type BanlistFormat = 'tcg' | 'ocg';

export type Card = {
  /** Passcode (the 8-digit number printed on the card). */
  id: number;
  nameEn: string;
  nameDe: string | null;
  descEn: string;
  descDe: string | null;
  /** YGOPRODeck type string, e.g. "Effect Monster" or "Spell Card". */
  type: string;
  frameType: FrameType;
  cardClass: CardClass;
  /** Monster type (e.g. "Spellcaster") or spell/trap property (e.g. "Quick-Play"). */
  race: string | null;
  attribute: string | null;
  /** Level, or rank for Xyz monsters. */
  level: number | null;
  linkVal: number | null;
  linkMarkers: string[] | null;
  scale: number | null;
  atk: number | null;
  def: number | null;
  archetype: string | null;
  typeline: string[] | null;
  isExtraDeck: boolean;
  banTcg: BanStatus | null;
  banOcg: BanStatus | null;
  /** Artwork ids; the first is the default artwork. */
  imageIds: number[];
};

export type CardSearchFilter = {
  query: string;
  /** Also search the card text, not just the name. */
  searchText: boolean;
  cardClass: 'monster' | 'spell' | 'trap' | null;
  /** Monster frame group, e.g. "effect" also matches "effect_pendulum" when pendulum is not set. */
  frame: MonsterFrameFilter | null;
  /** Spell/trap property such as "Quick-Play". */
  property: string | null;
  attribute: string | null;
  race: string | null;
  level: number | null;
  archetype: string | null;
  /** Only cards that are legal under the selected banlist. */
  legalOnly: boolean;
};

export type MonsterFrameFilter =
  | 'normal'
  | 'effect'
  | 'ritual'
  | 'fusion'
  | 'synchro'
  | 'xyz'
  | 'link'
  | 'pendulum'
  | 'tuner'
  | 'extra'
  | 'main';

export const EMPTY_FILTER: CardSearchFilter = {
  query: '',
  searchText: false,
  cardClass: null,
  frame: null,
  property: null,
  attribute: null,
  race: null,
  level: null,
  archetype: null,
  legalOnly: false,
};

export type ImageSize = 'small' | 'full';
