import type { Card } from '@/features/cards/types';

import type { DeckCards } from './types';
import { parseDeckList, type ParsedLine } from './ydk';

export type CardLookup = {
  resolvePasscodes: (ids: number[]) => Promise<Map<number, number | null>>;
  findCardByName: (name: string) => Promise<Card | null>;
  getCardsByIds: (ids: Iterable<number>) => Promise<Map<number, Card>>;
};

export type ImportResult = {
  cards: DeckCards;
  name: string | null;
  format: 'ydk' | 'ydke' | 'list';
  /** Lines that could not be matched to a card. */
  unknown: { line: number; text: string }[];
  total: number;
};

/**
 * Turns pasted text or a .ydk file into deck sections. Alternative artworks
 * are mapped to the main passcode. Lists without section headers are sorted
 * automatically (Fusion/Synchro/Xyz/Link -> Extra Deck).
 */
export async function importDeckList(input: string, lookup: CardLookup): Promise<ImportResult> {
  const parsed = parseDeckList(input);
  const passcodes = parsed.entries.filter((e) => e.passcode !== null).map((e) => e.passcode!);
  const resolved = await lookup.resolvePasscodes(passcodes);

  const unknown: ImportResult['unknown'] = [];
  const matched: { entry: ParsedLine; id: number; count: number }[] = [];

  for (const entry of parsed.entries) {
    let id: number | null = null;
    let count = entry.count;
    if (entry.passcode !== null) {
      id = resolved.get(entry.passcode) ?? null;
    } else if (entry.name) {
      const byName = await lookup.findCardByName(entry.name);
      if (byName) {
        id = byName.id;
      } else if (entry.raw !== entry.name) {
        // "7 Colored Fish": the leading number belongs to the card name.
        const byRaw = await lookup.findCardByName(entry.raw);
        if (byRaw) {
          id = byRaw.id;
          count = 1;
        }
      }
    }
    if (id === null) unknown.push({ line: entry.line, text: entry.raw });
    else matched.push({ entry, id, count });
  }

  const cardInfo = await lookup.getCardsByIds(matched.map((m) => m.id));
  const cards: DeckCards = { main: [], extra: [], side: [] };
  for (const { entry, id, count } of matched) {
    const info = cardInfo.get(id);
    const section = parsed.hasSections ? (entry.section ?? 'main') : info?.isExtraDeck ? 'extra' : 'main';
    for (let i = 0; i < Math.max(1, count); i++) cards[section].push(id);
  }

  return {
    cards,
    name: parsed.name,
    format: parsed.format,
    unknown,
    total: cards.main.length + cards.extra.length + cards.side.length,
  };
}
