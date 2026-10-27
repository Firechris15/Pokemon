import { MIGRATIONS } from '@/db/migrations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');

describe('database migrations', () => {
  it('apply in order on a fresh database', () => {
    const db = new DatabaseSync(':memory:');
    MIGRATIONS.forEach((sql, version) => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row: { name: string }) => row.name);
    expect(tables).toEqual(expect.arrayContaining(['cards', 'card_alias', 'decks', 'meta', 'settings', 'deck_card_meta', 'hand_practice', 'combos', 'combo_reviews', 'combo_attempts', 'puzzles', 'puzzle_attempts', 'daily_puzzles', 'engine_cards', 'engine_scripts', 'replays']));
    expect(db.prepare('PRAGMA user_version').get().user_version).toBe(MIGRATIONS.length);
    const replayColumns = db
      .prepare('PRAGMA table_info(replays)')
      .all()
      .map((row: { name: string }) => row.name);
    expect(replayColumns).toEqual(expect.arrayContaining(['data', 'stats', 'analysis']));
  });

  it('upgrade a version 1 database without losing decks', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(MIGRATIONS[0]);
    db.prepare("INSERT INTO decks (id, name, created_at, updated_at) VALUES ('d1', 'Test', 1, 1)").run();
    for (const sql of MIGRATIONS.slice(1)) db.exec(sql);
    expect(db.prepare('SELECT name FROM decks').all()).toEqual([{ name: 'Test' }]);
  });
});
