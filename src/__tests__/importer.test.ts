import { importDeckList } from '@/features/decks/importer';
import { toYdke } from '@/features/decks/ydk';

import { fakeLookup, ID } from './helpers';

describe('importDeckList', () => {
  it('keeps YDK sections and maps alternative artworks', async () => {
    const result = await importDeckList(`#main\n${ID.darkMagicianAlt}\n${ID.ash}\n#extra\n${ID.accesscode}\n!side\n${ID.maxxC}`, fakeLookup());
    expect(result.cards).toEqual({ main: [ID.darkMagician, ID.ash], extra: [ID.accesscode], side: [ID.maxxC] });
    expect(result.unknown).toEqual([]);
    expect(result.format).toBe('ydk');
  });

  it('reports unknown passcodes with their line number', async () => {
    const result = await importDeckList(`#main\n${ID.ash}\n12345678\n`, fakeLookup());
    expect(result.cards.main).toEqual([ID.ash]);
    expect(result.unknown).toEqual([{ line: 3, text: '12345678' }]);
  });

  it('sorts Extra Deck monsters automatically when the list has no sections', async () => {
    const result = await importDeckList(`3 Ash Blossom & Joyous Spring\n1 Accesscode Talker\nBaronne de Fleur\n2 Called by the Grave`, fakeLookup());
    expect(result.cards.main).toEqual([ID.ash, ID.ash, ID.ash, ID.called, ID.called]);
    expect(result.cards.extra).toEqual([ID.accesscode, ID.baronne]);
    expect(result.total).toBe(7);
  });

  it('accepts German card names', async () => {
    const result = await importDeckList('2 Aschblüte & Fröhlicher Frühling\nZugangscode-Sprecher', fakeLookup());
    expect(result.cards.main).toEqual([ID.ash, ID.ash]);
    expect(result.cards.extra).toEqual([ID.accesscode]);
  });

  it('imports ydke links', async () => {
    const link = toYdke({ main: [ID.ash, ID.ash], extra: [ID.zeus], side: [ID.nibiru] });
    const result = await importDeckList(link, fakeLookup());
    expect(result.cards).toEqual({ main: [ID.ash, ID.ash], extra: [ID.zeus], side: [ID.nibiru] });
  });
});
