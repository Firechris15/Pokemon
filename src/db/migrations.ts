/**
 * Schema migrations, applied in order. Each entry moves the database from
 * version `index` to `index + 1` (tracked in PRAGMA user_version).
 * Never edit a released migration; append a new one instead.
 */
export const MIGRATIONS: string[] = [
  // v1: card database, decks, settings
  `
  CREATE TABLE cards (
    id INTEGER PRIMARY KEY NOT NULL,
    name_en TEXT NOT NULL,
    name_de TEXT,
    desc_en TEXT NOT NULL DEFAULT '',
    desc_de TEXT,
    type TEXT NOT NULL,
    frame_type TEXT NOT NULL,
    card_class TEXT NOT NULL,
    race TEXT,
    attribute TEXT,
    level INTEGER,
    link_val INTEGER,
    link_markers TEXT,
    scale INTEGER,
    atk INTEGER,
    def INTEGER,
    archetype TEXT,
    typeline TEXT,
    is_extra INTEGER NOT NULL DEFAULT 0,
    ban_tcg TEXT,
    ban_ocg TEXT,
    image_ids TEXT NOT NULL,
    search_name TEXT NOT NULL
  );
  CREATE INDEX idx_cards_class ON cards(card_class);
  CREATE INDEX idx_cards_archetype ON cards(archetype);
  CREATE INDEX idx_cards_name_en ON cards(name_en COLLATE NOCASE);

  -- Alternative artwork passcodes -> main passcode (YDK files may use either).
  CREATE TABLE card_alias (
    alias_id INTEGER PRIMARY KEY NOT NULL,
    card_id INTEGER NOT NULL
  );

  CREATE TABLE meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE decks (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    main TEXT NOT NULL DEFAULT '[]',
    extra TEXT NOT NULL DEFAULT '[]',
    side TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
];
