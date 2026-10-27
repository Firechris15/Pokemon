import { create } from 'zustand';

import type { DataProgress } from '@/features/engine/data';
import type { EngineHost } from '@/features/engine/host';
import { prepareEngine } from '@/features/engine/prepare';
import type { FromEngine, ReplayInfo, ReplayReview, Snapshot, Suggestion, SuggestionCheck } from '@/features/engine/types';

import type { Replay } from './repository';

type ViewerState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress: DataProgress | null;
  error: string | null;
  replay: Replay | null;
  info: ReplayInfo | null;
  frame: number;
  /** Revealed snapshot of the current frame (hidden cards are marked). */
  snapshot: Snapshot | null;
  playing: boolean;
  /** Engine review in progress: decisions done / total, started at (ms). */
  reviewProgress: { done: number; total: number; startedAt: number } | null;
  strings: Map<number, string[]>;
  systemStrings: Map<number, string>;
  open: (replay: Replay) => Promise<void>;
  goto: (frame: number) => void;
  step: (delta: number) => void;
  setPlaying: (playing: boolean) => void;
  verify: (suggestions: Suggestion[]) => Promise<SuggestionCheck[]>;
  /** Rates every decision against its alternatives; null if the engine failed. */
  review: () => Promise<ReplayReview | null>;
  cancelReview: () => void;
  close: () => void;
};

const PLAY_INTERVAL_MS = 900;
const CACHE_SIZE = 300;

let host: EngineHost | null = null;
let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const cache = new Map<number, Snapshot>();
const requested = new Set<number>();
const waiting = new Map<string, (results: SuggestionCheck[]) => void>();
const reviewing = new Map<string, (review: ReplayReview | null) => void>();

function request(id: string, index: number) {
  if (cache.has(index) || requested.has(index) || !host) return;
  requested.add(index);
  host.send({ t: 'frame', id, index });
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Replay viewer: the engine replays the duel once and hands out the field of each step on demand. */
export const useReplayViewer = create<ViewerState>((set, get) => ({
  status: 'idle',
  progress: null,
  error: null,
  replay: null,
  info: null,
  frame: 0,
  snapshot: null,
  playing: false,
  reviewProgress: null,
  strings: new Map(),
  systemStrings: new Map(),

  async open(replay) {
    get().close();
    set({ status: 'loading', progress: null, error: null, replay, info: null, frame: 0, snapshot: null });
    try {
      const prepared = await prepareEngine(replay.data.config, (progress) => set({ progress }));
      if (get().replay?.id !== replay.id) return;
      host = prepared.host;
      set({ strings: prepared.strings, systemStrings: prepared.systemStrings, progress: { label: 'Replay wird nachgespielt', done: 0, total: null } });
      unsubscribe = host.listen(handleMessage);
      host.send({ t: 'replay', id: replay.id, config: replay.data.config, responses: replay.data.responses, viewer: replay.viewer });
    } catch (error) {
      set({ status: 'error', progress: null, error: error instanceof Error ? error.message : String(error) });
    }
  },

  goto(frame) {
    const { info, replay } = get();
    if (!info || !replay) return;
    const index = Math.max(0, Math.min(info.frames.length - 1, frame));
    set({ frame: index, snapshot: cache.get(index) ?? get().snapshot });
    request(replay.id, index);
    request(replay.id, index + 1);
    if (index === info.frames.length - 1) get().setPlaying(false);
  },

  step(delta) {
    get().goto(get().frame + delta);
  },

  setPlaying(playing) {
    stopTimer();
    set({ playing });
    if (!playing) return;
    const { info } = get();
    if (info && get().frame >= info.frames.length - 1) get().goto(0);
    timer = setInterval(() => get().step(1), PLAY_INTERVAL_MS);
  },

  verify(suggestions) {
    const { replay } = get();
    if (!host || !replay || suggestions.length === 0) return Promise.resolve([]);
    return new Promise((resolve) => {
      waiting.set(replay.id, resolve);
      host!.send({ t: 'verify', id: replay.id, suggestions });
    });
  },

  review() {
    const { replay } = get();
    if (!host || !replay) return Promise.resolve(null);
    set({ reviewProgress: { done: 0, total: 0, startedAt: Date.now() } });
    return new Promise((resolve) => {
      reviewing.set(replay.id, (review) => {
        set({ reviewProgress: null });
        resolve(review);
      });
      host!.send({ t: 'review', id: replay.id });
    });
  },

  cancelReview() {
    const { replay } = get();
    if (!replay) return;
    host?.send({ t: 'cancelReview', id: replay.id });
    reviewing.get(replay.id)?.(null);
    reviewing.delete(replay.id);
  },

  close() {
    stopTimer();
    unsubscribe?.();
    unsubscribe = null;
    if (get().replay) host?.send({ t: 'closeReplay' });
    cache.clear();
    requested.clear();
    for (const resolve of waiting.values()) resolve([]);
    waiting.clear();
    for (const resolve of reviewing.values()) resolve(null);
    reviewing.clear();
    set({ status: 'idle', replay: null, info: null, snapshot: null, frame: 0, playing: false, progress: null, reviewProgress: null });
  },
}));

function handleMessage(message: FromEngine) {
  const state = useReplayViewer.getState();
  const id = state.replay?.id;
  if (!id || !('id' in message) || message.id !== id) return;
  switch (message.t) {
    case 'replayInfo':
      useReplayViewer.setState({ status: 'ready', progress: null, info: message.info, frame: 0 });
      state.goto(0);
      break;
    case 'frame':
      requested.delete(message.index);
      cache.set(message.index, message.snapshot);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
      if (useReplayViewer.getState().frame === message.index) useReplayViewer.setState({ snapshot: message.snapshot });
      break;
    case 'verified':
      waiting.get(id)?.(message.results);
      waiting.delete(id);
      break;
    case 'reviewProgress': {
      const current = useReplayViewer.getState().reviewProgress;
      if (current) useReplayViewer.setState({ reviewProgress: { ...current, done: message.done, total: message.total } });
      break;
    }
    case 'reviewed':
      reviewing.get(id)?.(message.review);
      reviewing.delete(id);
      break;
    case 'replayError':
      if (useReplayViewer.getState().status === 'loading') useReplayViewer.setState({ status: 'error', progress: null, error: message.message });
      waiting.get(id)?.([]);
      waiting.delete(id);
      reviewing.get(id)?.(null);
      reviewing.delete(id);
      break;
  }
}
