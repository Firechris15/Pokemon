import { getDb } from '@/db/database';
import { escapeLike, foldForSearch } from '@/lib/text';

import { CARD_COLUMNS, cardToParams, rowToCard, toBanStatus, type CardRow } from './mapping';
import type { BanlistFormat, Card, CardSearchFilter } from './types';

const INSERT_CHUNK = 40;
const ID_CHUNK = 500;

// ---------------------------------------------------------------------------
// In-memory cache for single-card lookups (detail view, deck lists).

const cache = new Map<number, Card>();
const CACHE_LIMIT = 4000;

function remember(card: Card) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(card.id, card);
}

export function getCachedCard(id: number): Card | undefined {
  return cache.get(id);
}

export function clearCardCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Reads

export async function countCards(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM cards');
  return row?.n ?? 0;
}

export async function getCard(id: number): Promise<Card | null> {
  const cached = cache.get(id);
  if (cached) return cached;
  const cards = await getCardsByIds([id]);
  return cards.get(id) ?? null;
}

/** Loads many cards at once. Alternative-artwork ids are resolved as well. */
export async function getCardsByIds(ids: Iterable<number>): Promise<Map<number, Card>> {
  const result = new Map<number, Card>();
  const missing: number[] = [];
  for (const id of new Set(ids)) {
    const cached = cache.get(id);
    if (cached) result.set(id, cached);
    else missing.push(id);
  }
  if (missing.length === 0) return result;

  const db = await getDb();
  for (let i = 0; i < missing.length; i += ID_CHUNK) {
    const chunk = missing.slice(i, i + ID_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db.getAllAsync<CardRow>(`SELECT * FROM cards WHERE id IN (${placeholders})`, chunk);
    for (const row of rows) {
      const card = rowToCard(row);
      remember(card);
      result.set(card.id, card);
    }
  }
  return result;
}

/**
 * Maps passcodes (including alternative artworks) to main passcodes.
 * Unknown ids map to null.
 */
export async function resolvePasscodes(ids: number[]): Promise<Map<number, number | null>> {
  const unique = [...new Set(ids)];
  const result = new Map<number, number | null>(unique.map((id) => [id, null]));
  const db = await getDb();
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const direct = await db.getAllAsync<{ id: number }>(`SELECT id FROM cards WHERE id IN (${placeholders})`, chunk);
    for (const { id } of direct) result.set(id, id);
    const aliases = await db.getAllAsync<{ alias_id: number; card_id: number }>(
      `SELECT alias_id, card_id FROM card_alias WHERE alias_id IN (${placeholders})`,
      chunk
    );
    for (const { alias_id, card_id } of aliases) {
      if (result.get(alias_id) === null) result.set(alias_id, card_id);
    }
  }
  return result;
}

/** Finds a card by its exact English or German name (case/accent-insensitive). */
export async function findCardByName(name: string): Promise<Card | null> {
  const folded = foldForSearch(name);
  if (!folded) return null;
  const db = await getDb();
  const rows = await db.getAllAsync<CardRow & { search_name: string }>(
    `SELECT * FROM cards WHERE search_name LIKE ? ESCAPE '\\' LIMIT 50`,
    `%${escapeLike(folded)}%`
  );
  const match = rows.find((row) => row.search_name.split('\n').includes(folded));
  if (!match) return null;
  const card = rowToCard(match);
  remember(card);
  return card;
}

export type SearchOptions = {
  banlist: BanlistFormat;
  language: 'de' | 'en';
  /** Hide cards that can never be put in a deck (tokens, skill cards). */
  deckCardsOnly?: boolean;
  limit?: number;
  offset?: number;
};

export function buildSearchQuery(filter: CardSearchFilter, options: SearchOptions): { sql: string; params: (string | number)[] } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const query = filter.query.trim();
  const folded = foldForSearch(query);

  if (folded) {
    const like = `%${escapeLike(folded)}%`;
    const clauses = [`search_name LIKE ? ESCAPE '\\'`];
    params.push(like);
    if (filter.searchText) {
      const rawLike = `%${escapeLike(query)}%`;
      clauses.push(`desc_en LIKE ? ESCAPE '\\'`, `desc_de LIKE ? ESCAPE '\\'`);
      params.push(rawLike, rawLike);
    }
    if (/^\d{3,10}$/.test(query)) {
      clauses.push('id = ?');
      params.push(Number(query));
    }
    where.push(`(${clauses.join(' OR ')})`);
  }

  if (options.deckCardsOnly) where.push(`card_class NOT IN ('token', 'skill')`);
  if (filter.cardClass) {
    where.push('card_class = ?');
    params.push(filter.cardClass);
  }

  switch (filter.frame) {
    case null:
      break;
    case 'normal':
    case 'effect':
      where.push('frame_type IN (?, ?)');
      params.push(filter.frame, `${filter.frame}_pendulum`);
      break;
    case 'ritual':
    case 'fusion':
    case 'synchro':
    case 'xyz':
      where.push(`frame_type LIKE ?`);
      params.push(`${filter.frame}%`);
      break;
    case 'link':
      where.push(`frame_type = 'link'`);
      break;
    case 'pendulum':
      where.push(`frame_type LIKE '%_pendulum'`);
      break;
    case 'tuner':
      where.push(`typeline LIKE '%"Tuner"%'`);
      break;
    case 'extra':
      where.push('is_extra = 1');
      break;
    case 'main':
      where.push(`card_class = 'monster' AND is_extra = 0`);
      break;
  }

  if (filter.property) {
    where.push(`card_class IN ('spell', 'trap') AND race = ?`);
    params.push(filter.property);
  }
  if (filter.attribute) {
    where.push('attribute = ?');
    params.push(filter.attribute);
  }
  if (filter.race) {
    where.push(`card_class = 'monster' AND race = ?`);
    params.push(filter.race);
  }
  if (filter.level !== null) {
    where.push('COALESCE(level, link_val) = ?');
    params.push(filter.level);
  }
  if (filter.archetype) {
    where.push('archetype = ?');
    params.push(filter.archetype);
  }
  if (filter.legalOnly) {
    where.push(options.banlist === 'ocg' ? `(ban_ocg IS NULL OR ban_ocg != 'Forbidden')` : `(ban_tcg IS NULL OR ban_tcg != 'Forbidden')`);
  }

  const nameColumn = options.language === 'de' ? 'COALESCE(name_de, name_en)' : 'name_en';
  const order: string[] = [];
  if (folded) {
    // Names starting with the query first, then word starts, then the rest.
    order.push(`CASE WHEN search_name LIKE ? ESCAPE '\\' OR search_name LIKE ? ESCAPE '\\' THEN 0 WHEN search_name LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END`);
    const escaped = escapeLike(folded);
    params.push(`${escaped}%`, `%\n${escaped}%`, `% ${escaped}%`);
  }
  order.push(`${nameColumn} COLLATE NOCASE`);

  const sql =
    `SELECT * FROM cards` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY ${order.join(', ')} LIMIT ? OFFSET ?`;
  params.push(options.limit ?? 60, options.offset ?? 0);
  return { sql, params };
}

export async function searchCards(filter: CardSearchFilter, options: SearchOptions): Promise<Card[]> {
  const db = await getDb();
  const { sql, params } = buildSearchQuery(filter, options);
  const rows = await db.getAllAsync<CardRow>(sql, params);
  return rows.map((row) => {
    const card = rowToCard(row);
    remember(card);
    return card;
  });
}

export async function getArchetypes(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ archetype: string }>(
    'SELECT DISTINCT archetype FROM cards WHERE archetype IS NOT NULL ORDER BY archetype COLLATE NOCASE'
  );
  return rows.map((r) => r.archetype);
}

export async function getMonsterRaces(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ race: string }>(
    `SELECT DISTINCT race FROM cards WHERE card_class = 'monster' AND race IS NOT NULL ORDER BY race`
  );
  return rows.map((r) => r.race);
}

export async function getAllCardIds(): Promise<number[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number }>('SELECT id FROM cards');
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Writes

/** Replaces the whole card table in one transaction. */
export async function replaceAllCards(cards: Card[], onProgress?: (done: number, total: number) => void): Promise<void> {
  const db = await getDb();
  const columns = CARD_COLUMNS.join(', ');
  const rowPlaceholder = `(${CARD_COLUMNS.map(() => '?').join(', ')})`;

  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM cards; DELETE FROM card_alias;');
    for (let i = 0; i < cards.length; i += INSERT_CHUNK) {
      const chunk = cards.slice(i, i + INSERT_CHUNK);
      const sql = `INSERT OR REPLACE INTO cards (${columns}) VALUES ${chunk.map(() => rowPlaceholder).join(', ')}`;
      await db.runAsync(sql, chunk.flatMap(cardToParams));

      const aliases = chunk.flatMap((card) => card.imageIds.filter((id) => id !== card.id).map((alias) => [alias, card.id]));
      if (aliases.length > 0) {
        await db.runAsync(
          `INSERT OR REPLACE INTO card_alias (alias_id, card_id) VALUES ${aliases.map(() => '(?, ?)').join(', ')}`,
          aliases.flat()
        );
      }
      onProgress?.(Math.min(i + INSERT_CHUNK, cards.length), cards.length);
    }
  });
  clearCardCache();
}

/** Overwrites the banlist column for one format. */
export async function replaceBanlist(format: BanlistFormat, entries: { id: number; status: string | undefined }[]): Promise<void> {
  const db = await getDb();
  const column = format === 'ocg' ? 'ban_ocg' : 'ban_tcg';
  await db.withTransactionAsync(async () => {
    await db.execAsync(`UPDATE cards SET ${column} = NULL`);
    for (const entry of entries) {
      const status = toBanStatus(entry.status);
      if (status) await db.runAsync(`UPDATE cards SET ${column} = ? WHERE id = ?`, status, entry.id);
    }
  });
  clearCardCache();
}
