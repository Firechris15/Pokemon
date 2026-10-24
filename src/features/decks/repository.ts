import { getDb } from '@/db/database';
import { createId } from '@/lib/id';

import type { Deck, DeckCards, DeckSummary } from './types';

type DeckRow = {
  id: string;
  name: string;
  main: string;
  extra: string;
  side: string;
  notes: string;
  created_at: number;
  updated_at: number;
};

function parseIds(json: string): number[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function rowToDeck(row: DeckRow): Deck {
  return {
    id: row.id,
    name: row.name,
    main: parseIds(row.main),
    extra: parseIds(row.extra),
    side: parseIds(row.side),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function summarize(deck: Deck): DeckSummary {
  return {
    id: deck.id,
    name: deck.name,
    mainCount: deck.main.length,
    extraCount: deck.extra.length,
    sideCount: deck.side.length,
    coverId: deck.main[0] ?? deck.extra[0] ?? null,
    updatedAt: deck.updatedAt,
  };
}

export async function listDecks(): Promise<Deck[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<DeckRow>('SELECT * FROM decks ORDER BY updated_at DESC');
  return rows.map(rowToDeck);
}

export async function getDeck(id: string): Promise<Deck | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<DeckRow>('SELECT * FROM decks WHERE id = ?', id);
  return row ? rowToDeck(row) : null;
}

export async function createDeck(name: string, cards?: Partial<DeckCards>, notes = ''): Promise<Deck> {
  const now = Date.now();
  const deck: Deck = {
    id: createId(),
    name,
    main: cards?.main ?? [],
    extra: cards?.extra ?? [],
    side: cards?.side ?? [],
    notes,
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO decks (id, name, main, extra, side, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    deck.id,
    deck.name,
    JSON.stringify(deck.main),
    JSON.stringify(deck.extra),
    JSON.stringify(deck.side),
    deck.notes,
    deck.createdAt,
    deck.updatedAt
  );
  return deck;
}

export async function saveDeck(deck: Deck): Promise<Deck> {
  const updated = { ...deck, updatedAt: Date.now() };
  const db = await getDb();
  await db.runAsync(
    'UPDATE decks SET name = ?, main = ?, extra = ?, side = ?, notes = ?, updated_at = ? WHERE id = ?',
    updated.name,
    JSON.stringify(updated.main),
    JSON.stringify(updated.extra),
    JSON.stringify(updated.side),
    updated.notes,
    updated.updatedAt,
    updated.id
  );
  return updated;
}

export async function deleteDeck(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM decks WHERE id = ?', id);
    await db.runAsync('DELETE FROM deck_card_meta WHERE deck_id = ?', id);
    await db.runAsync('DELETE FROM hand_practice WHERE deck_id = ?', id);
  });
}

/** Copies the deck including its hand trainer tags (not the practice history). */
export async function duplicateDeck(id: string): Promise<Deck | null> {
  const source = await getDeck(id);
  if (!source) return null;
  const copy = await createDeck(`${source.name} (Kopie)`, source, source.notes);
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO deck_card_meta (deck_id, card_id, tags, starter_rank) SELECT ?, card_id, tags, starter_rank FROM deck_card_meta WHERE deck_id = ?',
    copy.id,
    id
  );
  return copy;
}
