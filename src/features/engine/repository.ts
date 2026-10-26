import { getDb, getMeta, setMeta } from '@/db/database';

import { packCard, unpackCard, type PackedCard } from './cardData';
import type { EngineCard } from './types';

const INSERT_CHUNK = 200;

export const META_ENGINE_CARDS_AT = 'engine.cards_updated_at';
export const META_ENGINE_STRINGS = 'engine.system_strings';

export type EngineCardRow = { card: EngineCard; name: string; strings: string[] };

export async function engineCardCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM engine_cards');
  return row?.n ?? 0;
}

export async function replaceEngineCards(rows: EngineCardRow[], onProgress?: (done: number, total: number) => void): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM engine_cards');
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      await db.runAsync(
        `INSERT OR REPLACE INTO engine_cards (code, data, name, strings) VALUES ${chunk.map(() => '(?, ?, ?, ?)').join(', ')}`,
        chunk.flatMap((r) => [r.card.code, JSON.stringify(packCard(r.card)), r.name, JSON.stringify(r.strings)])
      );
      onProgress?.(Math.min(i + INSERT_CHUNK, rows.length), rows.length);
    }
  });
  await setMeta(META_ENGINE_CARDS_AT, String(Date.now()));
}

export async function loadEngineCards(): Promise<EngineCard[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM engine_cards');
  return rows.map((r) => unpackCard(JSON.parse(r.data) as PackedCard));
}

/** Engine card data for the given passcodes (type, alias …). */
export async function engineCardsByCode(codes: number[]): Promise<Map<number, EngineCard>> {
  const result = new Map<number, EngineCard>();
  const unique = [...new Set(codes)];
  if (unique.length === 0) return result;
  const db = await getDb();
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const rows = await db.getAllAsync<{ data: string }>(`SELECT data FROM engine_cards WHERE code IN (${chunk.map(() => '?').join(',')})`, chunk);
    for (const r of rows) {
      const card = unpackCard(JSON.parse(r.data) as PackedCard);
      result.set(card.code, card);
    }
  }
  return result;
}

/** Effect strings ("Negate that effect") of cards, for prompts. */
export async function engineStrings(codes: number[]): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();
  const unique = [...new Set(codes)].filter((c) => c > 0);
  if (unique.length === 0) return result;
  const db = await getDb();
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const rows = await db.getAllAsync<{ code: number; strings: string }>(`SELECT code, strings FROM engine_cards WHERE code IN (${chunk.map(() => '?').join(',')})`, chunk);
    for (const r of rows) result.set(r.code, JSON.parse(r.strings) as string[]);
  }
  return result;
}

export async function saveSystemStrings(strings: Map<number, string>): Promise<void> {
  await setMeta(META_ENGINE_STRINGS, JSON.stringify([...strings]));
}

export async function loadSystemStrings(): Promise<Map<number, string>> {
  const raw = await getMeta(META_ENGINE_STRINGS);
  if (!raw) return new Map();
  try {
    return new Map(JSON.parse(raw) as [number, string][]);
  } catch {
    return new Map();
  }
}

export async function cachedScripts(): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string; source: string }>('SELECT name, source FROM engine_scripts');
  return new Map(rows.map((r) => [r.name, r.source]));
}

export async function saveScripts(entries: [string, string][]): Promise<void> {
  if (entries.length === 0) return;
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < entries.length; i += 50) {
      const chunk = entries.slice(i, i + 50);
      await db.runAsync(
        `INSERT OR REPLACE INTO engine_scripts (name, source, fetched_at) VALUES ${chunk.map(() => '(?, ?, ?)').join(', ')}`,
        chunk.flatMap(([name, source]) => [name, source, now])
      );
    }
  });
}

export async function scriptStats(): Promise<{ count: number; bytes: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number; bytes: number | null }>('SELECT COUNT(*) AS n, SUM(LENGTH(source)) AS bytes FROM engine_scripts');
  return { count: row?.n ?? 0, bytes: row?.bytes ?? 0 };
}

export async function clearScripts(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM engine_scripts');
}

export async function engineCardsUpdatedAt(): Promise<number | null> {
  const raw = await getMeta(META_ENGINE_CARDS_AT);
  return raw ? Number(raw) : null;
}
