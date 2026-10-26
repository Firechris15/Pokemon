import type { OcgCardData, OcgCoreSync } from 'ocgcore-wasm';

import { newMemory, respond as aiRespond, type AiContext, type AiMemory, type CardInfo } from '@/features/ai/policy';
import { searchResponse } from '@/features/ai/search';
import { seededRng, type Rng } from '@/lib/random';

import { toOcgCard } from '../core/convert';
import { DuelSession, type EngineEnv } from '../core/session';
import type { DuelConfig, FromEngine, LogEntry, Player, ReplayData, ToEngine } from '../types';

export type EngineRuntime = {
  lib: OcgCoreSync;
  flags: EngineEnv['flags'];
  /** ocgcore-wasm's opcode check for card declarations. */
  matchesOpcode: (card: OcgCardData, opcodes: bigint[]) => boolean;
  now: () => number;
};

const WIN_REASONS: Record<number, string> = {
  [-1]: 'Aufgegeben',
  0: 'Lebenspunkte auf 0',
  1: 'Keine Karten mehr im Deck',
  2: 'Zeit abgelaufen',
  3: 'Verbindung getrennt',
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
      }
    } catch (error) {
      this.post({ t: 'error', message: error instanceof Error ? error.message : String(error) });
    }
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
