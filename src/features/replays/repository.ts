import { getDb } from '@/db/database';
import type { Player, ReplayData } from '@/features/engine/types';

export type ReplayMode = 'ai' | 'puzzle';

export type ReplaySummary = {
  id: string;
  createdAt: number;
  mode: ReplayMode;
  title: string;
  myDeck: string;
  oppDeck: string;
  aiLevel: number | null;
  /** Engine player of the winner, null = draw / aborted. */
  winner: Player | null;
  /** Engine player the app user played. */
  viewer: Player;
  reason: string;
  turns: number;
  durationMs: number;
};

export type Replay = ReplaySummary & { data: ReplayData };

type Row = {
  id: string;
  created_at: number;
  mode: string;
  title: string;
  my_deck: string;
  opp_deck: string;
  ai_level: number | null;
  winner: number | null;
  reason: string;
  turns: number;
  duration_ms: number;
  data: string;
};

function toSummary(row: Row, data?: { viewer?: Player }): ReplaySummary {
  return {
    id: row.id,
    createdAt: row.created_at,
    mode: row.mode === 'puzzle' ? 'puzzle' : 'ai',
    title: row.title,
    myDeck: row.my_deck,
    oppDeck: row.opp_deck,
    aiLevel: row.ai_level,
    winner: row.winner === null ? null : (row.winner as Player),
    viewer: data?.viewer ?? 0,
    reason: row.reason,
    turns: row.turns,
    durationMs: row.duration_ms,
  };
}

export async function saveReplay(replay: Replay): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO replays (id, created_at, mode, title, my_deck, opp_deck, ai_level, winner, reason, turns, duration_ms, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    replay.id,
    replay.createdAt,
    replay.mode,
    replay.title,
    replay.myDeck,
    replay.oppDeck,
    replay.aiLevel,
    replay.winner,
    replay.reason,
    replay.turns,
    Math.round(replay.durationMs),
    JSON.stringify({ ...replay.data, viewer: replay.viewer })
  );
}

/** Newest first; the bulky data column is only parsed for the viewer. */
export async function listReplays(): Promise<ReplaySummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Omit<Row, 'data'> & { viewer: number | null }>(
    `SELECT id, created_at, mode, title, my_deck, opp_deck, ai_level, winner, reason, turns, duration_ms,
       json_extract(data, '$.viewer') AS viewer FROM replays ORDER BY created_at DESC`
  );
  return rows.map((r) => ({ ...toSummary({ ...r, data: '' }), viewer: (r.viewer ?? 0) as Player }));
}

export async function getReplay(id: string): Promise<Replay | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT * FROM replays WHERE id = ?', id);
  if (!row) return null;
  const data = JSON.parse(row.data) as ReplayData & { viewer?: Player };
  return { ...toSummary(row, data), data };
}

export async function deleteReplay(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM replays WHERE id = ?', id);
}
