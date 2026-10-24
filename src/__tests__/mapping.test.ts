import { levelLabel, statsLabel, typeLineLabel } from '@/features/cards/labels';
import { cardToParams, CARD_COLUMNS, mapApiCard, rowToCard, toBanStatus, type CardRow } from '@/features/cards/mapping';
import { mergeLanguages } from '@/features/cards/sync';

import { apiEnglish, apiGerman, cardMap, ID } from './helpers';

const cards = cardMap();

describe('mapApiCard', () => {
  it('maps a tuner monster with German text', () => {
    const ash = cards.get(ID.ash)!;
    expect(ash).toMatchObject({
      nameEn: 'Ash Blossom & Joyous Spring',
      nameDe: 'Aschblüte & Fröhlicher Frühling',
      cardClass: 'monster',
      frameType: 'effect',
      level: 3,
      atk: 0,
      def: 1800,
      isExtraDeck: false,
      banTcg: null,
    });
    expect(ash.descDe).toContain('annulliere');
  });

  it('detects Extra Deck monsters', () => {
    expect([ID.accesscode, ID.baronne, ID.zeus, ID.mudragon].map((id) => cards.get(id)!.isExtraDeck)).toEqual([true, true, true, true]);
    expect(cards.get(ID.oddEyes)!.isExtraDeck).toBe(false);
  });

  it('handles link monsters (no DEF, link rating and arrows)', () => {
    const link = cards.get(ID.accesscode)!;
    expect(link.def).toBeNull();
    expect(link.linkVal).toBe(4);
    expect(link.linkMarkers).toEqual(['Top', 'Bottom-Left', 'Bottom', 'Bottom-Right']);
    expect(levelLabel(link)).toBe('LINK-4');
    expect(statsLabel(link)).toBe('ATK 2300');
  });

  it('converts banlist values ("Banned" -> Forbidden)', () => {
    expect(cards.get(ID.maxxC)!.banTcg).toBe('Forbidden');
    expect(cards.get(ID.maxxC)!.banOcg).toBe('Limited');
    expect(toBanStatus('Semi-Limited')).toBe('Semi-Limited');
    expect(toBanStatus(undefined)).toBeNull();
  });

  it('keeps alternative artworks', () => {
    expect(cards.get(ID.darkMagician)!.imageIds).toEqual([46986414, 36996508, 38033121]);
  });

  it('falls back to English when no German entry exists', () => {
    const token = mergeLanguages(apiEnglish, apiGerman).find((c) => c.id === ID.sheepToken)!;
    expect(token.nameDe).toBeNull();
    expect(token.cardClass).toBe('token');
  });

  it('ignores stats on spells and traps', () => {
    const spell = mapApiCard({ ...apiEnglish.find((c) => c.id === ID.called)!, atk: 0, level: 4 });
    expect(spell.atk).toBeNull();
    expect(spell.level).toBeNull();
  });
});

describe('German labels', () => {
  it('builds type lines', () => {
    expect(typeLineLabel(cards.get(ID.ash)!)).toBe('[Zombie/Empfänger/Effekt]');
    expect(typeLineLabel(cards.get(ID.called)!)).toBe('Schnellzauberkarte');
    expect(typeLineLabel(cards.get(ID.imperm)!)).toBe('Fallenkarte');
    expect(typeLineLabel(cards.get(ID.snakeEyeFire)!)).toBe('Permanente Zauberkarte');
    expect(levelLabel(cards.get(ID.zeus)!)).toBe('Rang 12');
    expect(levelLabel(cards.get(ID.ash)!)).toBe('Stufe 3');
  });
});

describe('database row conversion', () => {
  it('round-trips through the SQL parameter list', () => {
    for (const card of cards.values()) {
      const params = cardToParams(card);
      expect(params).toHaveLength(CARD_COLUMNS.length);
      const row = Object.fromEntries(CARD_COLUMNS.map((column, i) => [column, params[i]])) as unknown as CardRow;
      expect(rowToCard(row)).toEqual(card);
    }
  });
});
