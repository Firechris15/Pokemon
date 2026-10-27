import type { OcgCardData, OcgCoreSync } from 'ocgcore-wasm';

import { newMemory, respond as aiRespond, type AiContext, type AiMemory, type CardInfo } from '@/features/ai/policy';
import { searchResponse } from '@/features/ai/search';
import { seededRng, type Rng } from '@/lib/random';

import { toOcgCard } from '../core/convert';
import { DuelSession, type EngineEnv } from '../core/session';
import type { DecisionReview, DuelConfig, EngineResponse, FromEngine, LogEntry, Player, ReplayData, Suggestion, ToEngine } from '../types';
import { checkSuggestion, runReplay, type ReplayRun } from './replay';
import { reviewDecision, summarize, type PlayFactory } from './review';

export type EngineRuntime = {
  lib: OcgCoreSync;
  flags: EngineEnv['flags'];
  /** ocgcore-wasm's opcode check for card declarations. */
  matchesOpcode: (card: OcgCardData, opcodes: bigint[]) => boolean;
  now: () => number;
};

// EDOPro victory reasons (strings.conf "!victory"); -1 = surrender in this app.
const WIN_REASONS: Record<number, string> = {
  [-1]: 'Aufgegeben',
  0: 'Aufgegeben',
  1: 'Lebenspunkte auf 0',
  2: 'Keine Karten mehr im Deck',
  3: 'Zeit abgelaufen',
  4: 'Verbindung getrennt',
  0x10: 'Exodia',
};

export function winReason(reason: number): string {
  return WIN_REASONS[reason] ?? 'Karteneffekt';
}

/**
 * Runs inside the engine worker: owns ocgcore, plays the AI's decisions and
 * reports every state change to the app.
 */
export class EngineController {
  private env: EngineEnv | null = null;
  private session: DuelSession | null = null;
  private viewer: Player = 0;
  private sent = 0;
  private aiDelay = 0;
  private aiThinkMs = 1500;
  private memories = new Map<Player, AiMemory>();
  private rng: Rng = Math.random;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The replay open in the viewer (independent of a running duel). */
  private replay: { id: string; config: DuelConfig; responses: EngineResponse[]; viewer: Player; run: ReplayRun } | null = null;

  constructor(
    private readonly runtime: EngineRuntime,
    private readonly post: (message: FromEngine) => void,
    options: { aiDelayMs?: number } = {}
  ) {
    this.aiDelay = options.aiDelayMs ?? 0;
  }

  handle(message: ToEngine): void {
    try {
      switch (message.t) {
        case 'init':
          this.env = {
            lib: this.runtime.lib,
            flags: this.runtime.flags,
            cards: new Map(message.cards.map((c) => [c.code, toOcgCard(c)])),
            scripts: new Map(message.scripts),
          };
          this.post({ t: 'ready' });
          break;
        case 'scripts':
          for (const [name, source] of message.scripts) this.env?.scripts.set(name, source);
          break;
        case 'start':
          this.start(message.config, message.viewer, message.aiThinkMs);
          break;
        case 'respond':
          if (!this.session) return;
          this.session.respond(message.response);
          this.pump();
          break;
        case 'surrender':
          if (!this.session) return;
          this.session.concede(this.viewer);
          this.pump();
          break;
        case 'stop':
          this.stop();
          break;
        case 'replay':
        case 'frame':
        case 'verify':
        case 'review':
        case 'closeReplay':
          this.handleReplay(message);
          break;
      }
    } catch (error) {
      this.post({ t: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  private handleReplay(message: Extract<ToEngine, { t: 'replay' | 'frame' | 'verify' | 'review' | 'closeReplay' }>) {
    if (message.t === 'closeReplay') {
      this.replay = null;
      return;
    }
    try {
      if (!this.env) throw new Error('Die Regel-Engine ist noch nicht bereit.');
      if (message.t === 'replay') {
        this.replay = null;
        const run = runReplay(this.env, message.config, message.responses, message.viewer);
        this.replay = { id: message.id, config: message.config, responses: message.responses, viewer: message.viewer, run };
        this.post({ t: 'replayInfo', id: message.id, info: { frames: run.frames, decisions: run.decisions, diverged: run.diverged } });
        return;
      }
      const replay = this.replay;
      if (!replay || replay.id !== message.id) throw new Error('Das Replay ist nicht geladen.');
      if (message.t === 'frame') {
        const index = Math.max(0, Math.min(replay.run.snapshots.length - 1, message.index));
        this.post({ t: 'frame', id: message.id, index, snapshot: replay.run.snapshots[index] });
        return;
      }
      if (message.t === 'review') {
        this.review(replay);
        return;
      }
      this.post({ t: 'verified', id: message.id, results: message.suggestions.map((s) => this.verify(s)) });
    } catch (error) {
      this.post({ t: 'replayError', id: message.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Level 1 AI for both players in a simulation; the same seed gives every compared option the same random numbers. */
  private playFactory(config: DuelConfig, seed: number): PlayFactory {
    return () => {
      const memories = new Map<Player, AiMemory>();
      const rng = seededRng(Number(BigInt(config.seed[0]) % 2147483647n) + seed);
      return (session: DuelSession, player: Player) => {
        const memory = memories.get(player) ?? newMemory();
        memories.set(player, memory);
        return aiRespond({ ...this.context(session, player, false, memory), rng, eager: false }, session.prompt!);
      };
    };
  }

  /** Engine check of an alternative move; both players continue with the level 1 AI. */
  private verify(suggestion: Suggestion) {
    const replay = this.replay!;
    const play = this.playFactory(replay.config, suggestion.decision)();
    return checkSuggestion(this.env!, replay.config, replay.responses, replay.viewer, replay.run, suggestion, play, this.cardInfo);
  }

  /**
   * Engine review of all the viewer's decisions. Runs in slices so frame
   * requests of the replay viewer still get answered, and reports progress.
   */
  private review(replay: NonNullable<EngineController['replay']>) {
    const { run } = replay;
    const decisions = run.decisions.filter((d) => run.diverged === null || d.index < run.diverged);
    const results: DecisionReview[] = [];
    let next = 0;
    const slice = () => {
      if (this.replay !== replay) return;
      try {
        const until = this.runtime.now() + 40;
        while (next < decisions.length && this.runtime.now() < until) {
          const d = decisions[next++];
          const result = reviewDecision(this.env!, replay.config, replay.responses, replay.viewer, d, this.playFactory(replay.config, d.index), this.cardInfo);
          if (result) results.push(result);
        }
      } catch (error) {
        this.post({ t: 'replayError', id: replay.id, message: error instanceof Error ? error.message : String(error) });
        return;
      }
      this.post({ t: 'reviewProgress', id: replay.id, done: next, total: decisions.length });
      if (next < decisions.length) setTimeout(slice, 0);
      else this.post({ t: 'reviewed', id: replay.id, review: summarize(results, run.diverged) });
    };
    slice();
  }

  private start(config: DuelConfig, viewer: Player, aiThinkMs?: number) {
    if (!this.env) throw new Error('Die Regel-Engine ist noch nicht bereit.');
    this.stop();
    this.viewer = viewer;
    this.sent = 0;
    this.memories = new Map();
    this.aiThinkMs = aiThinkMs ?? this.aiThinkMs;
    this.rng = seededRng(Number(BigInt(config.seed[0]) % 2147483647n));
    this.session = new DuelSession(this.env, config);
    this.pump();
  }

  private stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.session?.destroy();
    this.session = null;
  }

  private cardInfo = (code: number): CardInfo | undefined => {
    const card = this.env?.cards.get(code);
    return card ? { type: Number(card.type), attack: card.attack, defense: card.defense, level: card.level } : undefined;
  };

  private announce = (opcodes: number[]): number => {
    const ops = opcodes.map((o) => BigInt(o));
    const opponentCodes = this.session ? this.session.snapshot(this.viewer).players[this.viewer] : null;
    const known = opponentCodes ? [...opponentCodes.grave, ...opponentCodes.removed].map((c) => c.code) : [];
    for (const code of known) {
      const card = this.env?.cards.get(code);
      if (card && this.runtime.matchesOpcode(card, ops)) return code;
    }
    for (const card of this.env?.cards.values() ?? []) if (this.runtime.matchesOpcode(card, ops)) return card.code;
    return 0;
  };

  private context(session: DuelSession, player: Player, passive: boolean, memory?: AiMemory): AiContext {
    return {
      me: player,
      snapshot: session.snapshot(player),
      card: this.cardInfo,
      rng: this.rng,
      announce: this.announce,
      memory: memory ?? newMemory(),
      passive,
      eager: !passive && Boolean(session.config.players[player].eager),
    };
  }

  private isAi(player: Player): boolean {
    return this.session?.config.players[player].ai != null;
  }

  /** Lets the AI act until the human has to decide (or the duel ends). */
  private pump() {
    const session = this.session;
    if (!session) return;
    if (session.ended) {
      this.finish();
      return;
    }
    const prompt = session.prompt;
    if (prompt && this.isAi(prompt.request.player)) {
      const player = prompt.request.player;
      const level = session.config.players[player].ai;
      const interesting = prompt.request.type === 10 || prompt.request.type === 11;
      this.update(level === 2 && interesting);
      const step = () => {
        this.timer = null;
        if (this.session !== session || !session.prompt) return;
        try {
          session.respond(this.aiDecision(session, player));
        } catch (error) {
          this.post({ t: 'error', message: error instanceof Error ? error.message : String(error) });
          return;
        }
        this.pump();
      };
      if (this.aiDelay > 0 && interesting) this.timer = setTimeout(step, this.aiDelay);
      else step();
      return;
    }
    this.update(false);
  }

  private aiDecision(session: DuelSession, player: Player) {
    const prompt = session.prompt!;
    const memory = this.memories.get(player) ?? newMemory();
    this.memories.set(player, memory);
    const ctx = this.context(session, player, false, memory);
    if (session.config.players[player].ai === 2) {
      const searched = searchResponse(session, player, {
        budgetMs: this.aiThinkMs,
        maxSimulations: 400,
        now: this.runtime.now,
        rng: this.rng,
        card: this.cardInfo,
        context: (sim, p, passive) => this.context(sim, p, passive),
      });
      if (searched) return searched;
    }
    return aiRespond(ctx, prompt);
  }

  private newLog(): LogEntry[] {
    const session = this.session!;
    const entries = session.log.slice(this.sent);
    this.sent = session.log.length;
    return entries;
  }

  private update(thinking: boolean) {
    const session = this.session!;
    const prompt = session.prompt && session.prompt.request.player === this.viewer && !this.isAi(this.viewer) ? session.prompt : null;
    this.post({
      t: 'update',
      snapshot: session.snapshot(this.viewer),
      log: this.newLog(),
      prompt,
      thinking,
      missingScripts: [...session.missingScripts],
    });
  }

  private finish() {
    const session = this.session!;
    const winner = session.winner;
    const replay: ReplayData = {
      config: session.config,
      responses: [...session.responses],
      log: [...session.log],
      result: { winner: winner ? winner.player : null, reason: winner ? winReason(winner.reason) : 'Unentschieden' },
      turns: session.turn,
    };
    this.post({ t: 'update', snapshot: session.snapshot(this.viewer), log: this.newLog(), prompt: null, thinking: false, missingScripts: [...session.missingScripts] });
    this.post({ t: 'end', snapshot: session.snapshot(this.viewer), replay });
  }
}
