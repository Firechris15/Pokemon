export type HandTag = 'starter' | 'extender' | 'handtrap' | 'brick' | 'breaker';

export const HAND_TAGS: HandTag[] = ['starter', 'extender', 'handtrap', 'brick', 'breaker'];

export const TAG_LABELS: Record<HandTag, string> = {
  starter: 'Starter',
  extender: 'Extender',
  handtrap: 'Handtrap',
  brick: 'Brick',
  breaker: 'Board-Breaker',
};

export const TAG_HINTS: Record<HandTag, string> = {
  starter: 'Startet die Combo allein',
  extender: 'Verlängert die Combo oder ersetzt einen gestoppten Starter',
  handtrap: 'Unterbricht den Gegner aus der Hand',
  brick: 'Totes Gewicht in der Starthand',
  breaker: 'Räumt das gegnerische Feld ab',
};

/**
 * Identity colours for the five tags: the first five slots of the validated
 * categorical palette (dark mode), in fixed order. They always appear next
 * to the tag name, never as the only cue.
 */
export const TAG_COLORS: Record<HandTag, string> = {
  starter: '#3987e5',
  extender: '#d95926',
  handtrap: '#199e70',
  brick: '#c98500',
  breaker: '#d55181',
};

export const TAG_BITS: Record<HandTag, number> = {
  starter: 1,
  extender: 2,
  handtrap: 4,
  brick: 8,
  breaker: 16,
};

export function tagMask(tags: readonly HandTag[]): number {
  return tags.reduce((mask, tag) => mask | TAG_BITS[tag], 0);
}

/** Hand trainer data the user stores per card and deck. */
export type CardMeta = {
  tags: HandTag[];
  /** Position in the starter priority list (lower = better), only for starters. */
  starterRank: number | null;
};

export type DeckMeta = Record<number, CardMeta>;

export const EMPTY_META: CardMeta = { tags: [], starterRank: null };

export function metaOf(meta: DeckMeta, cardId: number): CardMeta {
  return meta[cardId] ?? EMPTY_META;
}

export function hasTag(meta: DeckMeta, cardId: number, tag: HandTag): boolean {
  return metaOf(meta, cardId).tags.includes(tag);
}

/**
 * Well-known hand traps and board breakers (English names). Only used for
 * the optional "suggest tags" button; the user decides what to keep.
 */
export const KNOWN_HANDTRAPS = [
  'Ash Blossom & Joyous Spring',
  'Maxx "C"',
  'Effect Veiler',
  'Infinite Impermanence',
  'Nibiru, the Primal Being',
  'Ghost Ogre & Snow Rabbit',
  'Ghost Belle & Haunted Mansion',
  'Ghost Mourner & Moonlit Chill',
  'Droll & Lock Bird',
  'D.D. Crow',
  'PSY-Framegear Gamma',
  'Dimension Shifter',
  'Mulcharmy Purulia',
  'Mulcharmy Fuwalos',
  'Mulcharmy Meowls',
  'Artifact Lancea',
  'Crossout Designator',
  'Skull Meister',
  'Dominus Impulse',
  'Dominus Purge',
];

export const KNOWN_BREAKERS = [
  'Lightning Storm',
  "Harpie's Feather Duster",
  'Raigeki',
  'Dark Hole',
  'Dark Ruler No More',
  'Evenly Matched',
  'Forbidden Droplet',
  'Triple Tactics Talent',
  'Cosmic Cyclone',
  'Twin Twisters',
  'Super Polymerization',
  'Lava Golem',
  'Book of Eclipse',
  'Gameciel, the Sea Turtle Kaiju',
  'Dogoran, the Mad Flame Kaiju',
  'Radian, the Multidimensional Kaiju',
  'Kumongous, the Sticky String Kaiju',
  'Gadarla, the Mystery Dust Kaiju',
  'Jizukiru, the Star Destroying Kaiju',
  'Thunder King, the Lightningstrike Kaiju',
];

/** Tags suggested for a card by its English name, or none. */
export function suggestedTags(englishName: string): HandTag[] {
  const tags: HandTag[] = [];
  if (KNOWN_HANDTRAPS.includes(englishName)) tags.push('handtrap');
  if (KNOWN_BREAKERS.includes(englishName)) tags.push('breaker');
  return tags;
}
