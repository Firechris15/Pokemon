import { getDb } from '@/db/database';

import { HAND_TAGS, type CardMeta, type DeckMeta, type HandTag } from './tags';

type MetaRow = { card_id: number; tags: string; starter_rank: number | null };

function parseTags(json: string): HandTag[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((t): t is HandTag => HAND_TAGS.includes(t)) : [];
  } catch {
    return [];
  }
}

export async function loadDeckMeta(deckId: string): Promise<DeckMeta> {
  const db = await getDb();
  const rows = await db.getAllAsync<MetaRow>('SELECT card_id, tags, starter_rank FROM deck_card_meta WHERE deck_id = ?', deckId);
  const meta: DeckMeta = {};
  for (const row of rows) meta[row.card_id] = { tags: parseTags(row.tags), starterRank: row.starter_rank };
  return meta;
}

export async function saveCardMeta(deckId: string, cardId: number, meta: CardMeta): Promise<void> {
  const db = await getDb();
  if (meta.tags.length === 0) {
    await db.runAsync('DELETE FROM deck_card_meta WHERE deck_id = ? AND card_id = ?', deckId, cardId);
    return;
  }
  await db.runAsync(
    `INSERT INTO deck_card_meta (deck_id, card_id, tags, starter_rank) VALUES (?, ?, ?, ?)
     ON CONFLICT(deck_id, card_id) DO UPDATE SET tags = excluded.tags, starter_rank = excluded.starter_rank`,
    deckId,
    cardId,
    JSON.stringify(meta.tags),
    meta.starterRank
  );
}

export type PracticeRecord = {
  deckId: string;
  goingFirst: boolean;
  hand: number[];
  answerPlayable: boolean;
  answerCard: number | null;
  correct: boolean;
};

export async function recordPractice(record: PracticeRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO hand_practice (deck_id, created_at, going_first, hand, answer_playable, answer_card, correct) VALUES (?, ?, ?, ?, ?, ?, ?)',
    record.deckId,
    Date.now(),
    record.goingFirst ? 1 : 0,
    JSON.stringify(record.hand),
    record.answerPlayable ? 1 : 0,
    record.answerCard,
    record.correct ? 1 : 0
  );
}

export type PracticeSummary = { total: number; correct: number; recentTotal: number; recentCorrect: number };

/** Overall accuracy plus the accuracy of the last 20 hands. */
export async function getPracticeSummary(deckId: string): Promise<PracticeSummary> {
  const db = await getDb();
  const all = await db.getFirstAsync<{ total: number; correct: number | null }>(
    'SELECT COUNT(*) AS total, SUM(correct) AS correct FROM hand_practice WHERE deck_id = ?',
    deckId
  );
  const recent = await db.getFirstAsync<{ total: number; correct: number | null }>(
    'SELECT COUNT(*) AS total, SUM(correct) AS correct FROM (SELECT correct FROM hand_practice WHERE deck_id = ? ORDER BY created_at DESC, id DESC LIMIT 20)',
    deckId
  );
  return {
    total: all?.total ?? 0,
    correct: all?.correct ?? 0,
    recentTotal: recent?.total ?? 0,
    recentCorrect: recent?.correct ?? 0,
  };
}

export async function clearPractice(deckId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM hand_practice WHERE deck_id = ?', deckId);
}
