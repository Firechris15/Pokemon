import { seededRng } from '@/lib/random';

import type { DailyEntry } from './types';

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/**
 * Chooses the daily puzzle: preferably one that was neither solved nor a
 * daily puzzle before, picked reproducibly from the date.
 */
export function pickDaily(day: string, puzzleIds: string[], history: DailyEntry[], solvedIds: Set<string>): string | null {
  if (puzzleIds.length === 0) return null;
  const featured = new Set(history.map((h) => h.puzzleId));
  const sorted = [...puzzleIds].sort();
  const pools = [sorted.filter((id) => !featured.has(id) && !solvedIds.has(id)), sorted.filter((id) => !featured.has(id)), sorted];
  const pool = pools.find((p) => p.length > 0)!;
  return pool[Math.floor(seededRng(hashString(day))() * pool.length)];
}

/** Days in a row with a solved daily puzzle, ending today (or yesterday if today is still open). */
export function dailyStreak(history: DailyEntry[], today: string): number {
  const solved = new Set(history.filter((h) => h.solvedAt !== null).map((h) => h.day));
  let day = solved.has(today) ? today : previousDay(today);
  let streak = 0;
  while (solved.has(day)) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}
