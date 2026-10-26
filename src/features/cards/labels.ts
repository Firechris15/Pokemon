import type { BanStatus, Card, CardClass, FrameType, MonsterFrameFilter } from './types';

export const ATTRIBUTES = ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'] as const;

export const ATTRIBUTE_LABELS: Record<string, string> = {
  DARK: 'Finsternis',
  LIGHT: 'Licht',
  EARTH: 'Erde',
  WATER: 'Wasser',
  FIRE: 'Feuer',
  WIND: 'Wind',
  DIVINE: 'Göttlich',
};

export const RACE_LABELS: Record<string, string> = {
  Aqua: 'Aqua',
  Beast: 'Ungeheuer',
  'Beast-Warrior': 'Ungeheuer-Krieger',
  'Creator-God': 'Schöpfergott',
  'Creator God': 'Schöpfergott',
  Cyberse: 'Cyberse',
  Dinosaur: 'Dinosaurier',
  'Divine-Beast': 'Göttliches Ungeheuer',
  Dragon: 'Drache',
  Fairy: 'Fee',
  Fiend: 'Unterweltler',
  Fish: 'Fisch',
  Illusion: 'Illusion',
  Insect: 'Insekt',
  Machine: 'Maschine',
  Plant: 'Pflanze',
  Psychic: 'Psi',
  Pyro: 'Pyro',
  Reptile: 'Reptil',
  Rock: 'Fels',
  'Sea Serpent': 'Seeschlange',
  Spellcaster: 'Hexer',
  Thunder: 'Donner',
  Warrior: 'Krieger',
  'Winged Beast': 'Geflügeltes Ungeheuer',
  Wyrm: 'Wyrm',
  Zombie: 'Zombie',
};

export const SPELL_PROPERTIES = ['Normal', 'Quick-Play', 'Continuous', 'Equip', 'Field', 'Ritual'] as const;
export const TRAP_PROPERTIES = ['Normal', 'Continuous', 'Counter'] as const;

export const PROPERTY_LABELS: Record<string, string> = {
  Normal: 'Normal',
  'Quick-Play': 'Schnell',
  Continuous: 'Permanent',
  Equip: 'Ausrüstung',
  Field: 'Spielfeld',
  Ritual: 'Ritual',
  Counter: 'Konter',
};

/** Official German names of spell/trap card types. */
const SPELL_TRAP_TYPE_LABELS: Record<string, string> = {
  'spell:Normal': 'Zauberkarte',
  'spell:Quick-Play': 'Schnellzauberkarte',
  'spell:Continuous': 'Permanente Zauberkarte',
  'spell:Equip': 'Ausrüstungszauberkarte',
  'spell:Field': 'Spielfeldzauberkarte',
  'spell:Ritual': 'Ritualzauberkarte',
  'trap:Normal': 'Fallenkarte',
  'trap:Continuous': 'Permanente Fallenkarte',
  'trap:Counter': 'Konterfallenkarte',
};

export const CLASS_LABELS: Record<CardClass, string> = {
  monster: 'Monster',
  spell: 'Zauber',
  trap: 'Falle',
  token: 'Spielmarke',
  skill: 'Skill',
};

export const FRAME_FILTER_LABELS: Record<MonsterFrameFilter, string> = {
  main: 'Main-Deck',
  extra: 'Extra-Deck',
  normal: 'Normal',
  effect: 'Effekt',
  ritual: 'Ritual',
  fusion: 'Fusion',
  synchro: 'Synchro',
  xyz: 'Xyz',
  link: 'Link',
  pendulum: 'Pendel',
  tuner: 'Empfänger',
};

const TYPELINE_LABELS: Record<string, string> = {
  Normal: 'Normal',
  Effect: 'Effekt',
  Ritual: 'Ritual',
  Fusion: 'Fusion',
  Synchro: 'Synchro',
  Xyz: 'Xyz',
  Link: 'Link',
  Pendulum: 'Pendel',
  Tuner: 'Empfänger',
  Flip: 'Flipp',
  Gemini: 'Zwilling',
  Spirit: 'Spirit',
  Toon: 'Toon',
  Union: 'Union',
};

export const BAN_LABELS: Record<BanStatus, string> = {
  Forbidden: 'Verboten',
  Limited: 'Limitiert',
  'Semi-Limited': 'Semi-limitiert',
};

export const BAN_LIMIT: Record<BanStatus, number> = {
  Forbidden: 0,
  Limited: 1,
  'Semi-Limited': 2,
};

export function labelForRace(race: string | null): string {
  if (!race) return '';
  return RACE_LABELS[race] ?? race;
}

export function displayName(card: Pick<Card, 'nameEn' | 'nameDe'>, language: 'de' | 'en'): string {
  return language === 'de' && card.nameDe ? card.nameDe : card.nameEn;
}

export function displayText(card: Pick<Card, 'descEn' | 'descDe'>, language: 'de' | 'en'): string {
  return language === 'de' && card.descDe ? card.descDe : card.descEn;
}

/** "[Hexer/Empfänger/Effekt]" style type line in German. */
export function typeLineLabel(card: Card): string {
  if (card.cardClass === 'spell' || card.cardClass === 'trap') {
    const fallback = card.cardClass === 'spell' ? 'Zauberkarte' : 'Fallenkarte';
    return SPELL_TRAP_TYPE_LABELS[`${card.cardClass}:${card.race ?? 'Normal'}`] ?? fallback;
  }
  if (card.cardClass !== 'monster') return CLASS_LABELS[card.cardClass];
  const parts = card.typeline?.length
    ? card.typeline.map((part) => (part === card.race ? labelForRace(part) : TYPELINE_LABELS[part] ?? labelForRace(part)))
    : [labelForRace(card.race), frameLabel(card.frameType)];
  return `[${parts.filter(Boolean).join('/')}]`;
}

export function frameLabel(frame: FrameType): string {
  const base = frame.replace('_pendulum', '');
  const label = FRAME_FILTER_LABELS[base as MonsterFrameFilter] ?? base;
  return frame.endsWith('_pendulum') ? `${label}/Pendel` : label;
}

/** "Stufe 4", "Rang 4" or "LINK-2". */
export function levelLabel(card: Card): string | null {
  if (card.cardClass !== 'monster') return null;
  if (card.frameType === 'link') return card.linkVal !== null ? `LINK-${card.linkVal}` : null;
  if (card.level === null) return null;
  return card.frameType.startsWith('xyz') ? `Rang ${card.level}` : `Stufe ${card.level}`;
}

export function statsLabel(card: Card): string | null {
  if (card.cardClass !== 'monster') return null;
  const atk = card.atk === null ? '?' : card.atk;
  if (card.frameType === 'link') return `ATK ${atk}`;
  const def = card.def === null ? '?' : card.def;
  return `ATK ${atk} / DEF ${def}`;
}

const LINK_MARKER_LABELS: Record<string, string> = {
  Top: 'Oben',
  Bottom: 'Unten',
  Left: 'Links',
  Right: 'Rechts',
  'Top-Left': 'Oben links',
  'Top-Right': 'Oben rechts',
  'Bottom-Left': 'Unten links',
  'Bottom-Right': 'Unten rechts',
};

export function linkMarkerLabel(marker: string): string {
  return LINK_MARKER_LABELS[marker] ?? marker;
}
