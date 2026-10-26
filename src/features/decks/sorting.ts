import { displayName } from '@/features/cards/labels';
import type { Card, FrameType } from '@/features/cards/types';

export type DeckEntry = { id: number; card: Card | null; count: number };

const CLASS_ORDER: Record<string, number> = { monster: 0, spell: 1, trap: 2 };

const FRAME_ORDER: Partial<Record<FrameType, number>> = {
  normal: 0,
  effect: 1,
  ritual: 2,
  normal_pendulum: 3,
  effect_pendulum: 3,
  ritual_pendulum: 3,
  fusion: 4,
  fusion_pendulum: 4,
  synchro: 5,
  synchro_pendulum: 5,
  xyz: 6,
  xyz_pendulum: 6,
  link: 7,
};

/**
 * Groups a deck section into unique cards with counts, ordered like a
 * printed decklist: monsters, spells, traps; Extra Deck by summon type.
 */
export function groupSection(ids: number[], cards: Map<number, Card>, language: 'de' | 'en'): DeckEntry[] {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const entries: DeckEntry[] = [...counts].map(([id, count]) => ({ id, count, card: cards.get(id) ?? null }));
  return entries.sort((a, b) => {
    if (!a.card || !b.card) return a.card ? -1 : b.card ? 1 : a.id - b.id;
    const byClass = (CLASS_ORDER[a.card.cardClass] ?? 3) - (CLASS_ORDER[b.card.cardClass] ?? 3);
    if (byClass) return byClass;
    const byFrame = (FRAME_ORDER[a.card.frameType] ?? 9) - (FRAME_ORDER[b.card.frameType] ?? 9);
    if (byFrame) return byFrame;
    const byRace = a.card.cardClass !== 'monster' ? (a.card.race ?? '').localeCompare(b.card.race ?? '') : 0;
    if (byRace) return byRace;
    const byLevel = (b.card.level ?? b.card.linkVal ?? 0) - (a.card.level ?? a.card.linkVal ?? 0);
    if (byLevel) return byLevel;
    return displayName(a.card, language).localeCompare(displayName(b.card, language), 'de');
  });
}

export function countByClass(ids: number[], cards: Map<number, Card>): { monster: number; spell: number; trap: number } {
  const result = { monster: 0, spell: 0, trap: 0 };
  for (const id of ids) {
    const cls = cards.get(id)?.cardClass;
    if (cls === 'monster' || cls === 'spell' || cls === 'trap') result[cls]++;
  }
  return result;
}
