import { foldForSearch } from '@/lib/text';

import type { ApiCard } from './api';
import type { BanStatus, Card, CardClass, FrameType } from './types';

const KNOWN_FRAMES = new Set<FrameType>([
  'normal',
  'effect',
  'ritual',
  'fusion',
  'synchro',
  'xyz',
  'link',
  'normal_pendulum',
  'effect_pendulum',
  'ritual_pendulum',
  'fusion_pendulum',
  'synchro_pendulum',
  'xyz_pendulum',
  'spell',
  'trap',
  'token',
  'skill',
]);

const EXTRA_DECK_FRAMES = new Set<FrameType>([
  'fusion',
  'synchro',
  'xyz',
  'link',
  'fusion_pendulum',
  'synchro_pendulum',
  'xyz_pendulum',
]);

export function toFrameType(frameType: string | undefined, type: string): FrameType {
  const normalized = (frameType ?? '').toLowerCase() as FrameType;
  if (KNOWN_FRAMES.has(normalized)) return normalized;
  // Fallback for unexpected values: derive from the type string.
  const t = type.toLowerCase();
  if (t.includes('spell')) return 'spell';
  if (t.includes('trap')) return 'trap';
  if (t.includes('token')) return 'token';
  if (t.includes('skill')) return 'skill';
  if (t.includes('link')) return 'link';
  if (t.includes('xyz')) return 'xyz';
  if (t.includes('synchro')) return 'synchro';
  if (t.includes('fusion')) return 'fusion';
  if (t.includes('ritual')) return 'ritual';
  if (t.includes('normal')) return 'normal';
  return 'effect';
}

export function toCardClass(frame: FrameType): CardClass {
  switch (frame) {
    case 'spell':
      return 'spell';
    case 'trap':
      return 'trap';
    case 'token':
      return 'token';
    case 'skill':
      return 'skill';
    default:
      return 'monster';
  }
}

export function isExtraDeckFrame(frame: FrameType): boolean {
  return EXTRA_DECK_FRAMES.has(frame);
}

export function toBanStatus(value: string | undefined | null): BanStatus | null {
  switch (value) {
    case 'Banned':
    case 'Forbidden':
      return 'Forbidden';
    case 'Limited':
      return 'Limited';
    case 'Semi-Limited':
      return 'Semi-Limited';
    default:
      return null;
  }
}

/** Builds the app's card model from the English entry plus an optional German one. */
export function mapApiCard(en: ApiCard, de?: ApiCard): Card {
  const frameType = toFrameType(en.frameType, en.type);
  const cardClass = toCardClass(frameType);
  const imageIds = (en.card_images ?? []).map((image) => image.id).filter((id) => Number.isFinite(id));
  return {
    id: en.id,
    nameEn: en.name,
    nameDe: de?.name ?? null,
    descEn: en.desc ?? '',
    descDe: de?.desc ?? null,
    type: en.type,
    frameType,
    cardClass,
    race: en.race ?? null,
    attribute: en.attribute ?? null,
    level: cardClass === 'monster' && typeof en.level === 'number' ? en.level : null,
    linkVal: typeof en.linkval === 'number' ? en.linkval : null,
    linkMarkers: en.linkmarkers?.length ? en.linkmarkers : null,
    scale: typeof en.scale === 'number' ? en.scale : null,
    atk: cardClass === 'monster' && typeof en.atk === 'number' ? en.atk : null,
    def: cardClass === 'monster' && frameType !== 'link' && typeof en.def === 'number' ? en.def : null,
    archetype: en.archetype ?? null,
    typeline: en.typeline?.length ? en.typeline : null,
    isExtraDeck: isExtraDeckFrame(frameType),
    banTcg: toBanStatus(en.banlist_info?.ban_tcg),
    banOcg: toBanStatus(en.banlist_info?.ban_ocg),
    imageIds: imageIds.length > 0 ? imageIds : [en.id],
  };
}

/** Text stored in the search column: folded English and German names. */
export function searchNameFor(card: Pick<Card, 'nameEn' | 'nameDe'>): string {
  return [card.nameEn, card.nameDe].filter(Boolean).map((n) => foldForSearch(n!)).join('\n');
}

export type CardRow = {
  id: number;
  name_en: string;
  name_de: string | null;
  desc_en: string;
  desc_de: string | null;
  type: string;
  frame_type: string;
  card_class: string;
  race: string | null;
  attribute: string | null;
  level: number | null;
  link_val: number | null;
  link_markers: string | null;
  scale: number | null;
  atk: number | null;
  def: number | null;
  archetype: string | null;
  typeline: string | null;
  is_extra: number;
  ban_tcg: string | null;
  ban_ocg: string | null;
  image_ids: string;
};

export const CARD_COLUMNS = [
  'id',
  'name_en',
  'name_de',
  'desc_en',
  'desc_de',
  'type',
  'frame_type',
  'card_class',
  'race',
  'attribute',
  'level',
  'link_val',
  'link_markers',
  'scale',
  'atk',
  'def',
  'archetype',
  'typeline',
  'is_extra',
  'ban_tcg',
  'ban_ocg',
  'image_ids',
  'search_name',
] as const;

export function cardToParams(card: Card): (string | number | null)[] {
  return [
    card.id,
    card.nameEn,
    card.nameDe,
    card.descEn,
    card.descDe,
    card.type,
    card.frameType,
    card.cardClass,
    card.race,
    card.attribute,
    card.level,
    card.linkVal,
    card.linkMarkers ? JSON.stringify(card.linkMarkers) : null,
    card.scale,
    card.atk,
    card.def,
    card.archetype,
    card.typeline ? JSON.stringify(card.typeline) : null,
    card.isExtraDeck ? 1 : 0,
    card.banTcg,
    card.banOcg,
    JSON.stringify(card.imageIds),
    searchNameFor(card),
  ];
}

function parseJsonArray<T>(value: string | null): T[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export function rowToCard(row: CardRow): Card {
  const frameType = row.frame_type as FrameType;
  return {
    id: row.id,
    nameEn: row.name_en,
    nameDe: row.name_de,
    descEn: row.desc_en,
    descDe: row.desc_de,
    type: row.type,
    frameType,
    cardClass: row.card_class as CardClass,
    race: row.race,
    attribute: row.attribute,
    level: row.level,
    linkVal: row.link_val,
    linkMarkers: parseJsonArray<string>(row.link_markers),
    scale: row.scale,
    atk: row.atk,
    def: row.def,
    archetype: row.archetype,
    typeline: parseJsonArray<string>(row.typeline),
    isExtraDeck: row.is_extra === 1,
    banTcg: toBanStatus(row.ban_tcg),
    banOcg: toBanStatus(row.ban_ocg),
    imageIds: parseJsonArray<number>(row.image_ids) ?? [row.id],
  };
}
