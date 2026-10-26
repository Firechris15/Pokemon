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

  // v2: hand trainer – per-deck card tags and practice history
  `
  CREATE TABLE deck_card_meta (
    deck_id TEXT NOT NULL,
    card_id INTEGER NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    starter_rank INTEGER,
    PRIMARY KEY (deck_id, card_id)
  );

  CREATE TABLE hand_practice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    going_first INTEGER NOT NULL,
    hand TEXT NOT NULL,
    answer_playable INTEGER NOT NULL,
    answer_card INTEGER,
    correct INTEGER NOT NULL
  );
  CREATE INDEX idx_hand_practice_deck ON hand_practice(deck_id, created_at);
  `,

  // v3: combo trainer – combo routes, spaced repetition state, quiz attempts
  `
  CREATE TABLE combos (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    deck_id TEXT,
    data TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE combo_reviews (
    combo_id TEXT PRIMARY KEY NOT NULL,
    ease REAL NOT NULL,
    interval_days REAL NOT NULL,
    repetitions INTEGER NOT NULL,
    lapses INTEGER NOT NULL,
    due_at INTEGER NOT NULL,
    last_reviewed_at INTEGER,
    step_errors TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE combo_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    combo_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    mode TEXT NOT NULL,
    correct INTEGER NOT NULL,
    total INTEGER NOT NULL
  );
  CREATE INDEX idx_combo_attempts ON combo_attempts(combo_id, created_at);
  `,
  // v4: puzzles – positions with solutions, attempts (Elo), daily puzzle history
  `
  CREATE TABLE puzzles (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    difficulty INTEGER NOT NULL,
    rating REAL NOT NULL,
    source TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE puzzle_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puzzle_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    solved INTEGER NOT NULL,
    mistakes INTEGER NOT NULL,
    hints INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    rated INTEGER NOT NULL,
    rating_before REAL,
    rating_after REAL,
    daily INTEGER NOT NULL
  );
  CREATE INDEX idx_puzzle_attempts ON puzzle_attempts(puzzle_id, created_at);

  CREATE TABLE daily_puzzles (
    day TEXT PRIMARY KEY NOT NULL,
    puzzle_id TEXT NOT NULL,
    solved_at INTEGER
  );
  `,
];
