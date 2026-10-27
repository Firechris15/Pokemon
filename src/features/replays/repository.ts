import { getDb } from '@/db/database';
import type { MatchAnalysis } from '@/features/analysis/types';
import type { Player, ReplayData } from '@/features/engine/types';

import { matchStats, type MatchStats } from './stats';

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

export type Replay = ReplaySummary & { data: ReplayData; stats?: MatchStats | null; analysis?: MatchAnalysis | null };

export type ReplayListItem = ReplaySummary & { stats: MatchStats | null; analysed: boolean };

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
  stats: string | null;
  analysis: string | null;
};

function toSummary(row: Omit<Row, 'data' | 'stats' | 'analysis'>, viewer: Player): ReplaySummary {
  return {
    id: row.id,
    createdAt: row.created_at,
    mode: row.mode === 'puzzle' ? 'puzzle' : 'ai',
    title: row.title,
    myDeck: row.my_deck,
    oppDeck: row.opp_deck,
    aiLevel: row.ai_level,
    winner: row.winner === null ? null : (row.winner as Player),
    viewer,
    reason: row.reason,
    turns: row.turns,
    durationMs: row.duration_ms,
  };
}

const parse = <T>(json: string | null): T | null => {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
};

export async function saveReplay(replay: Replay): Promise<void> {
  const db = await getDb();
  const stats = replay.stats ?? matchStats(replay.data, replay.viewer);
  await db.runAsync(
    `INSERT OR REPLACE INTO replays (id, created_at, mode, title, my_deck, opp_deck, ai_level, winner, reason, turns, duration_ms, data, stats, analysis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    JSON.stringify({ ...replay.data, viewer: replay.viewer }),
    JSON.stringify(stats),
    replay.analysis ? JSON.stringify(replay.analysis) : null
  );
}

/** Newest first, with key figures; replays from before the statistics get them computed once. */
export async function listReplays(): Promise<ReplayListItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Omit<Row, 'data' | 'analysis'> & { viewer: number | null; analysed: number }>(
    `SELECT id, created_at, mode, title, my_deck, opp_deck, ai_level, winner, reason, turns, duration_ms, stats,
       json_extract(data, '$.viewer') AS viewer, analysis IS NOT NULL AS analysed FROM replays ORDER BY created_at DESC`
  );
  const items: ReplayListItem[] = [];
  for (const row of rows) {
    const summary = toSummary(row, (row.viewer ?? 0) as Player);
    let stats = parse<MatchStats>(row.stats);
    if (!stats) {
      const replay = await getReplay(row.id);
      if (replay) {
        stats = matchStats(replay.data, replay.viewer);
        await db.runAsync('UPDATE replays SET stats = ? WHERE id = ?', JSON.stringify(stats), row.id);
      }
    }
    items.push({ ...summary, stats, analysed: Boolean(row.analysed) });
  }
  return items;
}

export async function getReplay(id: string): Promise<Replay | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT * FROM replays WHERE id = ?', id);
  if (!row) return null;
  const data = JSON.parse(row.data) as ReplayData & { viewer?: Player };
  return { ...toSummary(row, data.viewer ?? 0), data, stats: parse<MatchStats>(row.stats), analysis: parse<MatchAnalysis>(row.analysis) };
}

export async function saveAnalysis(id: string, analysis: MatchAnalysis | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE replays SET analysis = ? WHERE id = ?', analysis ? JSON.stringify(analysis) : null, id);
}

export async function deleteReplay(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM replays WHERE id = ?', id);
}
