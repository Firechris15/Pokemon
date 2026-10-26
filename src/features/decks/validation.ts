import { BAN_LABELS, BAN_LIMIT, displayName } from '@/features/cards/labels';
import type { BanlistFormat, Card } from '@/features/cards/types';

import { DECK_LIMITS, SECTION_LABELS, type DeckCards, type DeckSection } from './types';

export type DeckIssue = {
  severity: 'error' | 'warning';
  message: string;
  cardId?: number;
  section?: DeckSection;
};

export type DeckValidation = {
  valid: boolean;
  issues: DeckIssue[];
  /** Card ids involved in an error, for highlighting. */
  flaggedCards: Set<number>;
};

/**
 * Checks a deck against the official construction rules:
 * Main 40–60, Extra ≤ 15, Side ≤ 15, at most 3 copies per card across all
 * three sections, and the selected Forbidden & Limited list.
 */
export function validateDeck(
  deck: DeckCards,
  cards: Map<number, Card>,
  banlist: BanlistFormat,
  language: 'de' | 'en' = 'de'
): DeckValidation {
  const issues: DeckIssue[] = [];
  const flagged = new Set<number>();
  const nameOf = (id: number) => {
    const card = cards.get(id);
    return card ? displayName(card, language) : `#${id}`;
  };

  const main = deck.main.length;
  if (main < DECK_LIMITS.mainMin) {
    issues.push({ severity: 'error', section: 'main', message: `Main Deck hat ${main} Karten – mindestens ${DECK_LIMITS.mainMin} nötig.` });
  } else if (main > DECK_LIMITS.mainMax) {
    issues.push({ severity: 'error', section: 'main', message: `Main Deck hat ${main} Karten – höchstens ${DECK_LIMITS.mainMax} erlaubt.` });
  }
  if (deck.extra.length > DECK_LIMITS.extraMax) {
    issues.push({ severity: 'error', section: 'extra', message: `Extra Deck hat ${deck.extra.length} Karten – höchstens ${DECK_LIMITS.extraMax} erlaubt.` });
  }
  if (deck.side.length > DECK_LIMITS.sideMax) {
    issues.push({ severity: 'error', section: 'side', message: `Side Deck hat ${deck.side.length} Karten – höchstens ${DECK_LIMITS.sideMax} erlaubt.` });
  }

  // Copies across main + extra + side.
  const copies = new Map<number, number>();
  for (const id of [...deck.main, ...deck.extra, ...deck.side]) copies.set(id, (copies.get(id) ?? 0) + 1);

  for (const [id, count] of copies) {
    const card = cards.get(id);
    if (!card) {
      issues.push({ severity: 'warning', cardId: id, message: `Unbekannte Karte ${id} – bitte Kartendatenbank aktualisieren.` });
      continue;
    }
    if (count > DECK_LIMITS.copies) {
      flagged.add(id);
      issues.push({ severity: 'error', cardId: id, message: `${nameOf(id)}: ${count} Kopien – höchstens ${DECK_LIMITS.copies} erlaubt.` });
    }
    const status = banlist === 'ocg' ? card.banOcg : card.banTcg;
    if (status && count > BAN_LIMIT[status]) {
      flagged.add(id);
      const allowed = BAN_LIMIT[status];
      issues.push({
        severity: 'error',
        cardId: id,
        message:
          allowed === 0
            ? `${nameOf(id)} ist verboten (${banlist.toUpperCase()}).`
            : `${nameOf(id)} ist ${BAN_LABELS[status].toLowerCase()} (${banlist.toUpperCase()}): ${count} statt höchstens ${allowed}.`,
      });
    }
    if (card.cardClass === 'token' || card.cardClass === 'skill') {
      flagged.add(id);
      issues.push({ severity: 'error', cardId: id, message: `${nameOf(id)} darf nicht in ein Deck.` });
    }
  }

  // Misplaced cards.
  const misplaced = (section: DeckSection, ids: number[], predicate: (card: Card) => boolean, message: string) => {
    for (const id of new Set(ids)) {
      const card = cards.get(id);
      if (card && predicate(card)) {
        flagged.add(id);
        issues.push({ severity: 'error', cardId: id, section, message: `${nameOf(id)}: ${message}` });
      }
    }
  };
  misplaced('main', deck.main, (c) => c.isExtraDeck, `gehört ins Extra Deck, nicht ins ${SECTION_LABELS.main}.`);
  misplaced('extra', deck.extra, (c) => !c.isExtraDeck, 'ist kein Extra-Deck-Monster.');

  return { valid: !issues.some((i) => i.severity === 'error'), issues, flaggedCards: flagged };
}

/** Section a card goes to when added "to the deck" (side deck must be chosen explicitly). */
export function defaultSectionFor(card: Card): DeckSection {
  return card.isExtraDeck ? 'extra' : 'main';
}

/** How many more copies of a card may be added (ignoring section sizes). */
export function remainingCopies(deck: DeckCards, card: Card, banlist: BanlistFormat): number {
  const used = [...deck.main, ...deck.extra, ...deck.side].filter((id) => id === card.id).length;
  const status = banlist === 'ocg' ? card.banOcg : card.banTcg;
  const limit = status ? BAN_LIMIT[status] : DECK_LIMITS.copies;
  return Math.max(0, limit - used);
}
