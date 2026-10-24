import type { DeckCards } from '@/features/decks/types';
import { remainingCopies, validateDeck } from '@/features/decks/validation';

import { cardMap, ID } from './helpers';

const cards = cardMap();
const repeat = (id: number, n: number) => Array.from({ length: n }, () => id);

/** 3 copies each of the unlimited main deck cards in the fixture (24 cards). */
function unlimitedCards(): number[] {
  const unlimited = [ID.ash, ID.darkMagician, ID.oddEyes, ID.snakeEyeAsh, ID.poplar, ID.nibiru, ID.imperm, ID.snakeEyeFire];
  return unlimited.flatMap((id) => repeat(id, 3));
}

function messages(deck: DeckCards, format: 'tcg' | 'ocg' = 'tcg') {
  return validateDeck(deck, cards, format).issues.map((i) => i.message);
}

describe('validateDeck', () => {
  it('requires 40–60 main deck cards', () => {
    const result = validateDeck({ main: unlimitedCards(), extra: [], side: [] }, cards, 'tcg');
    expect(result.valid).toBe(false);
    expect(result.issues[0].message).toContain('mindestens 40');
  });

  it('accepts a legal deck', () => {
    // The fixture is small, so pad to 40 with ids that are not in the database (warnings only).
    const padded = [...unlimitedCards(), ...Array.from({ length: 16 }, (_, i) => 90000000 + i)];
    const result = validateDeck({ main: padded, extra: [ID.accesscode, ID.baronne], side: [ID.called] }, cards, 'tcg');
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'warning')).toHaveLength(16);
  });

  it('limits Extra and Side Deck to 15', () => {
    const msgs = messages({ main: [], extra: repeat(ID.accesscode, 3).concat(Array(13).fill(ID.zeus)), side: Array(16).fill(ID.ash) });
    expect(msgs.some((m) => m.startsWith('Extra Deck hat 16'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('Side Deck hat 16'))).toBe(true);
  });

  it('counts copies across main, extra and side', () => {
    const msgs = messages({ main: repeat(ID.ash, 3), extra: [], side: [ID.ash] });
    expect(msgs).toContain('Aschblüte & Fröhlicher Frühling: 4 Kopien – höchstens 3 erlaubt.');
  });

  it('applies the selected banlist', () => {
    const deck = { main: [ID.maxxC, ID.called, ID.called, ID.ttt, ID.ttt], extra: [], side: [] };
    const tcg = messages(deck, 'tcg');
    expect(tcg).toContain('Maxx „C“ ist verboten (TCG).');
    expect(tcg).toContain('Vom Grab gerufen ist limitiert (TCG): 2 statt höchstens 1.');
    expect(tcg).toContain('Dreifaches Taktiktalent ist limitiert (TCG): 2 statt höchstens 1.');

    const ocg = messages(deck, 'ocg');
    expect(ocg.some((m) => m.includes('Maxx'))).toBe(false); // Limited in OCG, 1 copy is fine
    expect(ocg.some((m) => m.includes('Dreifaches Taktiktalent'))).toBe(false); // Semi-Limited in OCG
  });

  it('flags misplaced cards and tokens', () => {
    const result = validateDeck({ main: [ID.accesscode, ID.sheepToken], extra: [ID.ash], side: [] }, cards, 'tcg');
    const msgs = result.issues.map((i) => i.message);
    expect(msgs).toContain('Zugangscode-Sprecher: gehört ins Extra Deck, nicht ins Main Deck.');
    expect(msgs).toContain('Aschblüte & Fröhlicher Frühling: ist kein Extra-Deck-Monster.');
    expect(msgs).toContain('Sheep Token darf nicht in ein Deck.');
    expect(result.flaggedCards.has(ID.accesscode)).toBe(true);
  });
});

describe('remainingCopies', () => {
  it('respects the 3-copy rule and banlist', () => {
    const deck = { main: [ID.ash, ID.ash], extra: [], side: [] };
    expect(remainingCopies(deck, cards.get(ID.ash)!, 'tcg')).toBe(1);
    expect(remainingCopies(deck, cards.get(ID.pot)!, 'tcg')).toBe(0);
    expect(remainingCopies(deck, cards.get(ID.called)!, 'tcg')).toBe(1);
    expect(remainingCopies({ main: [ID.called], extra: [], side: [] }, cards.get(ID.called)!, 'tcg')).toBe(0);
  });
});
