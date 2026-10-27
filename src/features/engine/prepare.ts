import { downloadEngineCards, ensureScripts, type DataProgress } from './data';
import { getEngineHost, type EngineHost } from './host';
import * as repo from './repository';
import type { DuelConfig, FromEngine } from './types';

let host: EngineHost | null = null;
let initializedScripts = -1;

/** All passcodes a duel needs scripts for. */
export function duelCodes(config: DuelConfig): number[] {
  const codes = config.players.flatMap((p) => [...p.main, ...p.extra]);
  if (config.puzzle) for (const m of config.puzzle.matchAll(/Debug\.AddCard\((\d+),/g)) codes.push(Number(m[1]));
  return [...new Set(codes)];
}

export function waitFor(h: EngineHost, predicate: (m: FromEngine) => boolean): Promise<FromEngine> {
  return new Promise((resolve) => {
    const stop = h.listen((m) => {
      if (predicate(m)) {
        stop();
        resolve(m);
      }
    });
  });
}

export type PreparedEngine = {
  host: EngineHost;
  /** Effect strings of the duel's cards (for prompts) and EDOPro system strings. */
  strings: Map<number, string[]>;
  systemStrings: Map<number, string>;
};

/**
 * Makes sure the rules data and the scripts of a duel are on the device
 * (downloads what is missing), starts the engine once and hands it new
 * scripts afterwards. Used for duels and for replays.
 */
export async function prepareEngine(config: DuelConfig, progress: (p: DataProgress) => void): Promise<PreparedEngine> {
  if ((await repo.engineCardCount()) === 0) await downloadEngineCards(progress);
  const codes = duelCodes(config);
  const known = await repo.engineCardsByCode(codes);
  await ensureScripts([...codes, ...[...known.values()].map((c) => c.alias).filter(Boolean)], progress, known);

  host ??= getEngineHost();
  const scripts = await repo.cachedScripts();
  if (initializedScripts < 0) {
    progress({ label: 'Regel-Engine starten', done: 0, total: null });
    const ready = waitFor(host, (m) => m.t === 'ready' || m.t === 'error');
    host.send({ t: 'init', cards: await repo.loadEngineCards(), scripts: [...scripts] });
    const answer = await ready;
    if (answer.t === 'error') throw new Error(answer.message);
    initializedScripts = scripts.size;
  } else if (scripts.size !== initializedScripts) {
    host.send({ t: 'scripts', scripts: [...scripts] });
    initializedScripts = scripts.size;
  }
  const [strings, systemStrings] = await Promise.all([repo.engineStrings(codes), repo.loadSystemStrings()]);
  return { host, strings, systemStrings };
}
