import { deserializeDatabaseAsync } from 'expo-sqlite';

import { downloadBytes } from '@/features/cards/download';

import { CDB_QUERY, cdbRowStrings, cdbRowToCard, parseStringsConf, type CdbRow } from './cardData';
import { CardType } from './ocg';
import * as repo from './repository';
import { BASE_SCRIPTS, CDB_URL, cardScriptName, referencedScripts, SCRIPT_BASE_URL, scriptPaths, STRINGS_URL } from './scriptRefs';
import type { EngineCard } from './types';

export type DataProgress = { label: string; done: number; total: number | null };

/**
 * Downloads EDOPro's card database (BabelCDB, ~8 MB) and the system strings
 * and stores the rules data locally. Card names and images still come from
 * YGOPRODeck; this only adds what the rules engine needs.
 */
export async function downloadEngineCards(onProgress?: (p: DataProgress) => void): Promise<number> {
  const bytes = await downloadBytes(CDB_URL, (p) => onProgress?.({ label: 'Regel-Datenbank laden', done: p.received, total: p.total }));
  onProgress?.({ label: 'Regel-Datenbank lesen', done: 0, total: null });
  const cdb = await deserializeDatabaseAsync(bytes);
  let rows: CdbRow[];
  try {
    rows = await cdb.getAllAsync<CdbRow>(CDB_QUERY);
  } finally {
    await cdb.closeAsync();
  }
  if (rows.length < 50) throw new Error('Die Regel-Datenbank ist unvollständig.');
  await repo.replaceEngineCards(
    rows.map((row) => ({ card: cdbRowToCard(row), name: row.name, strings: cdbRowStrings(row) })),
    (done, total) => onProgress?.({ label: 'Regel-Datenbank speichern', done, total })
  );
  try {
    const response = await fetch(STRINGS_URL);
    if (response.ok) await repo.saveSystemStrings(parseStringsConf(await response.text()));
  } catch {
    // System strings are optional (German texts for common prompts are built in).
  }
  return rows.length;
}

async function fetchScript(name: string): Promise<string | null> {
  for (const path of scriptPaths(name)) {
    let response: Response;
    try {
      response = await fetch(SCRIPT_BASE_URL + path);
    } catch {
      throw new Error('Keine Verbindung zu GitHub. Die Kartenskripte konnten nicht geladen werden.');
    }
    if (response.ok) return response.text();
    if (response.status !== 404) throw new Error(`Kartenskript ${name}: GitHub antwortete mit Status ${response.status}.`);
  }
  return null;
}

/**
 * Makes sure the Lua scripts for these cards (and every script they load)
 * are stored locally. Cards without a script (Normal Monsters) are stored as
 * empty, so they are not requested again.
 */
export async function ensureScripts(
  codes: number[],
  onProgress?: (p: DataProgress) => void,
  cards: Map<number, EngineCard> = new Map()
): Promise<{ downloaded: number; missing: string[] }> {
  const cache = await repo.cachedScripts();
  // Normal Monsters (except Pendulums) and Tokens have no script; don't ask GitHub for them.
  const scriptless = (code: number) => {
    const type = cards.get(code)?.type ?? 0;
    return (type & CardType.TOKEN) !== 0 || ((type & CardType.NORMAL) !== 0 && (type & CardType.PENDULUM) === 0);
  };
  for (const code of codes) if (scriptless(code) && !cache.has(cardScriptName(code))) cache.set(cardScriptName(code), '');
  const wanted = new Set<string>([...BASE_SCRIPTS, ...codes.filter((c) => c > 0).map(cardScriptName)]);
  // Scripts already cached may reference others that are not.
  for (const source of cache.values()) for (const ref of referencedScripts(source)) wanted.add(ref);
  const queue = [...wanted].filter((name) => !cache.has(name));
  const fetched: [string, string][] = [];
  const missing: string[] = [];
  let done = 0;
  const total = () => done + queue.length;

  const worker = async () => {
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
      const source = await fetchScript(name);
      if (source === null && !/^c\d+\.lua$/.test(name)) missing.push(name);
      fetched.push([name, source ?? '']);
      cache.set(name, source ?? '');
      for (const ref of referencedScripts(source ?? '')) {
        if (!cache.has(ref) && !queue.includes(ref)) queue.push(ref);
      }
      done++;
      onProgress?.({ label: 'Kartenskripte laden', done, total: total() });
    }
  };
  for (const code of codes) if (scriptless(code)) fetched.push([cardScriptName(code), '']);
  if (queue.length > 0) {
    onProgress?.({ label: 'Kartenskripte laden', done: 0, total: queue.length });
    await Promise.all(Array.from({ length: 6 }, worker));
  }
  await repo.saveScripts(fetched);
  return { downloaded: fetched.length, missing };
}

/** Downloads every cached script again (after EDOPro fixed or changed cards). */
export async function refreshScripts(onProgress?: (p: DataProgress) => void): Promise<number> {
  const queue = [...(await repo.cachedScripts()).keys()];
  const total = queue.length;
  const fetched: [string, string][] = [];
  const worker = async () => {
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
      fetched.push([name, (await fetchScript(name)) ?? '']);
      onProgress?.({ label: 'Kartenskripte aktualisieren', done: fetched.length, total });
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  // Saved only after everything arrived, so an interrupted update keeps the old scripts.
  await repo.saveScripts(fetched);
  return fetched.length;
}
