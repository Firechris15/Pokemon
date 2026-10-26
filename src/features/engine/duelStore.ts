import { create } from 'zustand';

import { boardCardIds } from '@/features/duel/state';
import type { DuelState } from '@/features/duel/types';
import { saveReplay, type ReplayMode } from '@/features/replays/repository';
import { createId } from '@/lib/id';

import { puzzleScript } from './core/puzzleScript';
import { downloadEngineCards, ensureScripts, type DataProgress } from './data';
import { getEngineHost, type EngineHost } from './host';
import * as repo from './repository';
import type { DuelConfig, DuelResult, EngineResponse, FromEngine, LogEntry, Player, Prompt, Snapshot } from './types';

export type DuelSetup = {
  mode: ReplayMode;
  title: string;
  myDeck: string;
  oppDeck: string;
  aiLevel: number | null;
  config: DuelConfig;
  /** Engine player the app user controls. */
  viewer: Player;
  puzzleId?: string;
  /** Puzzle position; turned into an EDOPro puzzle script once the rules data is there. */
  puzzleState?: DuelState;
};

type DuelUiState = {
  status: 'idle' | 'preparing' | 'playing' | 'ended' | 'error';
  progress: DataProgress | null;
  error: string | null;
  setup: DuelSetup | null;
  snapshot: Snapshot | null;
  log: LogEntry[];
  prompt: Prompt | null;
  thinking: boolean;
  missingScripts: string[];
  result: DuelResult | null;
  replayId: string | null;
  /** Effect strings of the cards in this duel (for prompts) and EDOPro system strings. */
  strings: Map<number, string[]>;
  systemStrings: Map<number, string>;
  start: (setup: DuelSetup) => Promise<void>;
  respond: (response: EngineResponse) => void;
  surrender: () => void;
  leave: () => void;
};

let host: EngineHost | null = null;
let unsubscribe: (() => void) | null = null;
let initializedScripts = -1;
let startedAt = 0;

/** All passcodes the duel needs scripts for. */
function duelCodes(config: DuelConfig): number[] {
  const codes = config.players.flatMap((p) => [...p.main, ...p.extra]);
  if (config.puzzle) for (const m of config.puzzle.matchAll(/Debug\.AddCard\((\d+),/g)) codes.push(Number(m[1]));
  return [...new Set(codes)];
}

function waitFor(h: EngineHost, predicate: (m: FromEngine) => boolean): Promise<FromEngine> {
  return new Promise((resolve) => {
    const stop = h.listen((m) => {
      if (predicate(m)) {
        stop();
        resolve(m);
      }
    });
  });
}

export const useDuel = create<DuelUiState>((set, get) => ({
  status: 'idle',
  progress: null,
  error: null,
  setup: null,
  snapshot: null,
  log: [],
  prompt: null,
  thinking: false,
  missingScripts: [],
  result: null,
  replayId: null,
  strings: new Map(),
  systemStrings: new Map(),

  async start(setup) {
    unsubscribe?.();
    set({ status: 'preparing', progress: null, error: null, setup, snapshot: null, log: [], prompt: null, thinking: false, result: null, replayId: null, missingScripts: [] });
    const progress = (p: DataProgress) => set({ progress: p });
    try {
      if ((await repo.engineCardCount()) === 0) await downloadEngineCards(progress);
      if (setup.puzzleState) {
        const types = await repo.engineCardsByCode(boardCardIds(setup.puzzleState));
        const config = { ...setup.config, puzzle: puzzleScript(setup.puzzleState, (code) => types.get(code)?.type ?? 0) };
        setup = { ...setup, config };
        set({ setup });
      }
      const codes = duelCodes(setup.config);
      const known = await repo.engineCardsByCode(codes);
      await ensureScripts([...codes, ...[...known.values()].map((c) => c.alias).filter(Boolean)], progress, known);

      host ??= getEngineHost();
      const scripts = await repo.cachedScripts();
      if (initializedScripts < 0) {
        set({ progress: { label: 'Regel-Engine starten', done: 0, total: null } });
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
      set({ strings, systemStrings });

      unsubscribe = host.listen((message) => handleMessage(message));
      startedAt = Date.now();
      set({ status: 'playing', progress: null });
      host.send({ t: 'start', config: setup.config, viewer: setup.viewer });
    } catch (error) {
      set({ status: 'error', progress: null, error: error instanceof Error ? error.message : String(error) });
    }
  },

  respond(response) {
    if (get().status !== 'playing' || !get().prompt) return;
    set({ prompt: null });
    host?.send({ t: 'respond', response });
  },

  surrender() {
    if (get().status !== 'playing') return;
    set({ prompt: null });
    host?.send({ t: 'surrender' });
  },

  leave() {
    if (get().status === 'playing') host?.send({ t: 'surrender' });
    host?.send({ t: 'stop' });
    unsubscribe?.();
    unsubscribe = null;
    set({ status: 'idle', setup: null, snapshot: null, log: [], prompt: null, result: null, replayId: null });
  },
}));

function handleMessage(message: FromEngine) {
  const state = useDuel.getState();
  switch (message.t) {
    case 'update':
      useDuel.setState({
        snapshot: message.snapshot,
        log: message.log.length ? [...state.log, ...message.log] : state.log,
        prompt: message.prompt,
        thinking: message.thinking,
        missingScripts: message.missingScripts,
      });
      break;
    case 'end': {
      const setup = state.setup;
      const id = createId();
      useDuel.setState({ status: 'ended', snapshot: message.snapshot, prompt: null, thinking: false, result: message.replay.result, replayId: id });
      if (setup) {
        saveReplay({
          id,
          createdAt: Date.now(),
          mode: setup.mode,
          title: setup.title,
          myDeck: setup.myDeck,
          oppDeck: setup.oppDeck,
          aiLevel: setup.aiLevel,
          winner: message.replay.result.winner,
          viewer: setup.viewer,
          reason: message.replay.result.reason,
          turns: message.replay.turns,
          durationMs: Date.now() - startedAt,
          data: message.replay,
        }).catch(() => undefined);
      }
      break;
    }
    case 'error':
      useDuel.setState({ status: 'error', error: message.message, prompt: null, thinking: false });
      break;
  }
}

/** Who takes the first turn: 'random' tosses a coin. */
export function humanGoesFirst(first: 'random' | 'me' | 'ai'): boolean {
  return first === 'random' ? Math.random() < 0.5 : first === 'me';
}

/** Random 64-bit seed parts (decimal strings) for a new duel. */
export function randomSeed(): [string, string, string, string] {
  const part = () => (BigInt(Math.floor(Math.random() * 2 ** 31)) * BigInt(2 ** 31) + BigInt(Math.floor(Math.random() * 2 ** 31)) + 1n).toString();
  return [part(), part(), part(), part()];
}
