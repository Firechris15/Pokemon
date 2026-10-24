/**
 * Runs the app's real schema and search SQL against SQLite (node:sqlite),
 * so filter combinations are checked end to end.
 */
import { MIGRATIONS } from '@/db/migrations';
import { CARD_COLUMNS, cardToParams } from '@/features/cards/mapping';
import { buildSearchQuery, type SearchOptions } from '@/features/cards/repository';
import { EMPTY_FILTER, type CardSearchFilter } from '@/features/cards/types';

import { fixtureCards, ID } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');
db.exec(MIGRATIONS[0]);
const insert = db.prepare(`INSERT INTO cards (${CARD_COLUMNS.join(', ')}) VALUES (${CARD_COLUMNS.map(() => '?').join(', ')})`);
for (const card of fixtureCards()) insert.run(...cardToParams(card));

const options: SearchOptions = { banlist: 'tcg', language: 'de', limit: 100 };

function search(filter: Partial<CardSearchFilter>, opts: Partial<SearchOptions> = {}): number[] {
  const { sql, params } = buildSearchQuery({ ...EMPTY_FILTER, ...filter }, { ...options, ...opts });
  return db.prepare(sql).all(...params).map((row: { id: number }) => row.id);
}

describe('card search', () => {
  it('finds cards by English or German name, ignoring case and umlauts', () => {
    expect(search({ query: 'ash blossom' })).toEqual([ID.ash]);
    expect(search({ query: 'ASCHBLUTE' })).toEqual([ID.ash]);
    expect(search({ query: 'aschblüte' })).toEqual([ID.ash]);
  });

  it('ranks names that start with the query before word matches', () => {
    expect(search({ query: 'ash' })).toEqual([ID.ash, ID.snakeEyeAsh]);
    expect(search({ query: 'snake' }).sort()).toEqual([ID.snakeEyeAsh, ID.poplar, ID.snakeEyeFire].sort());
  });

  it('treats LIKE wildcards in the query literally', () => {
    expect(search({ query: '%' })).toEqual([]);
    expect(search({ query: '"c"' })).toEqual([ID.maxxC]);
  });

  it('finds cards by passcode', () => {
    expect(search({ query: String(ID.nibiru) })).toEqual([ID.nibiru]);
  });

  it('searches the card text when enabled', () => {
    expect(search({ query: 'Friedhof' })).toEqual([]);
    expect(search({ query: 'Friedhof', searchText: true }).sort()).toEqual([ID.maxxC, ID.called].sort());
  });

  it('filters by card class and spell property', () => {
    expect(search({ cardClass: 'trap' })).toEqual([ID.imperm]);
    expect(search({ cardClass: 'spell', property: 'Quick-Play' })).toEqual([ID.called]);
  });

  it('filters monsters by frame, attribute, type and level', () => {
    expect(search({ frame: 'extra' }).sort()).toEqual([ID.accesscode, ID.baronne, ID.zeus, ID.mudragon].sort());
    expect(search({ frame: 'pendulum' })).toEqual([ID.oddEyes]);
    expect(search({ frame: 'tuner' })).toEqual([ID.ash]);
    expect(search({ frame: 'normal' })).toEqual([ID.darkMagician]);
    expect(search({ attribute: 'FIRE' }).sort()).toEqual([ID.ash, ID.snakeEyeAsh, ID.poplar].sort());
    expect(search({ race: 'Pyro', level: 1 }).sort()).toEqual([ID.snakeEyeAsh, ID.poplar].sort());
    expect(search({ level: 4 })).toEqual([ID.accesscode]); // link rating counts as level filter
  });

  it('filters by archetype', () => {
    expect(search({ archetype: 'Snake-Eye' }).sort()).toEqual([ID.snakeEyeAsh, ID.poplar, ID.snakeEyeFire].sort());
  });

  it('hides forbidden cards for the selected banlist', () => {
    expect(search({ legalOnly: true })).not.toContain(ID.maxxC);
    expect(search({ legalOnly: true }, { banlist: 'ocg' })).toContain(ID.maxxC);
    expect(search({ legalOnly: true })).not.toContain(ID.pot);
  });

  it('can exclude tokens', () => {
    expect(search({})).toContain(ID.sheepToken);
    expect(search({}, { deckCardsOnly: true })).not.toContain(ID.sheepToken);
  });

  it('paginates', () => {
    const all = search({});
    const first = search({}, { limit: 5, offset: 0 });
    const second = search({}, { limit: 5, offset: 5 });
    expect([...first, ...second]).toEqual(all.slice(0, 10));
  });
});
