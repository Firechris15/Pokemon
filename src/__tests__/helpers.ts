import type { ApiCard } from '@/features/cards/api';
import { mapApiCard } from '@/features/cards/mapping';
import type { Card } from '@/features/cards/types';
import { foldForSearch } from '@/lib/text';

const en: { data: ApiCard[] } = require('../../test/fixtures/cardinfo.en.json');
const de: { data: ApiCard[] } = require('../../test/fixtures/cardinfo.de.json');

export const apiEnglish = en.data;
export const apiGerman = de.data;

export function fixtureCards(): Card[] {
  const germanById = new Map(apiGerman.map((c) => [c.id, c]));
  return apiEnglish.map((c) => mapApiCard(c, germanById.get(c.id)));
}

export function cardMap(): Map<number, Card> {
  return new Map(fixtureCards().map((c) => [c.id, c]));
}

/** In-memory replacement for the card repository, used by importer tests. */
export function fakeLookup() {
  const cards = cardMap();
  return {
    async resolvePasscodes(ids: number[]) {
      const result = new Map<number, number | null>();
      for (const id of ids) {
        if (cards.has(id)) result.set(id, id);
        else result.set(id, [...cards.values()].find((c) => c.imageIds.includes(id))?.id ?? null);
      }
      return result;
    },
    async findCardByName(name: string) {
      const folded = foldForSearch(name);
      return [...cards.values()].find((c) => foldForSearch(c.nameEn) === folded || (c.nameDe && foldForSearch(c.nameDe) === folded)) ?? null;
    },
    async getCardsByIds(ids: Iterable<number>) {
      const result = new Map<number, Card>();
      for (const id of ids) {
        const card = cards.get(id);
        if (card) result.set(id, card);
      }
      return result;
    },
  };
}

export const ID = {
  ash: 14558127,
  maxxC: 23434538,
  darkMagician: 46986414,
  darkMagicianAlt: 36996508,
  accesscode: 86066372,
  baronne: 84815190,
  zeus: 90448279,
  mudragon: 54757758,
  oddEyes: 16178681,
  snakeEyeAsh: 9674034,
  poplar: 48452496,
  nibiru: 27204311,
  called: 24224830,
  pot: 55144522,
  ttt: 25311006,
  imperm: 10045474,
  snakeEyeFire: 89023486,
  sheepToken: 73915052,
} as const;
