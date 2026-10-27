import type { OcgCardData, OcgCardQueryInfo, OcgCoreSync, OcgDuelHandle, OcgLocation, OcgQueryFlags } from 'ocgcore-wasm';

import { seededRng, shuffled } from '@/lib/random';

import { HintType, Loc, Msg, Pos, signedLp } from '../ocg';
import { BASE_SCRIPTS } from '../scriptRefs';
import type { CardView, ChainLinkView, DuelConfig, EngineMessage, EngineResponse, LogEntry, Player, PlayerView, Prompt, SelectRequest, Snapshot } from '../types';
import { toEngineMessage, toOcgResponse } from './convert';

/** What a duel needs: the engine, all card data and the downloaded scripts. */
export type EngineEnv = {
  lib: OcgCoreSync;
  cards: Map<number, OcgCardData>;
  /** Script name → source; '' = known to have no script (Normal Monsters). */
  scripts: Map<string, string>;
  /** Duel mode flags from ocgcore-wasm (Master Rule 5, attack on the first turn). */
  flags: { mr5: bigint; attackFirstTurn: bigint };
  /** The engine's WebAssembly memory (current view); lets sessions be saved and restored. */
  heap?: () => Uint8Array;
};

/** A saved point of a session: the whole engine memory plus the session's own state. */
export type SavedSession = {
  memory: Uint8Array;
  responses: number;
  log: number;
  prompt: Prompt | null;
  winner: { player: Player; reason: number } | null;
  turn: number;
  turnPlayer: Player;
  phase: number;
  chain: ChainLinkView[];
  hints: [number | null, number | null];
};

const PROCESS_END = 0;
const PROCESS_WAITING = 1;

// CODE | POSITION | ATTACK | DEFENSE | BASE_ATTACK | BASE_DEFENSE | OVERLAY_CARD | OWNER | IS_PUBLIC
// (TYPE is not queried: ocgcore-wasm 0.1.6 cannot parse it; the type comes from the card data.)
const QUERY_FLAGS = 0x1 | 0x2 | 0x100 | 0x200 | 0x400 | 0x800 | 0x10000 | 0x40000 | 0x100000;

const SELECT_TYPES = new Set<number>([10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 132, 140, 141, 142, 143]);

const isHiddenLocation = (location: number, position: number) =>
  location === Loc.HAND || location === Loc.DECK || location === Loc.EXTRA || ((location & (Loc.MZONE | Loc.SZONE)) !== 0 && (position & Pos.FACEDOWN) !== 0);

/**
 * One duel in ocgcore. Runs the engine until it needs a decision, keeps the
 * response log (for replays and for cloning), a readable duel log and the
 * current turn, phase and chain.
 */
export class DuelSession {
  readonly responses: EngineResponse[] = [];
  readonly log: LogEntry[] = [];
  prompt: Prompt | null = null;
  winner: { player: Player; reason: number } | null = null;
  turn = 0;
  turnPlayer: Player = 0;
  phase = 0;
  chain: ChainLinkView[] = [];
  readonly missingScripts = new Set<string>();
  /** Script errors reported by the engine (first 50). */
  readonly errors: string[] = [];
  private readonly handle: OcgDuelHandle;
  private readonly hints: [number | null, number | null] = [null, null];
  private destroyed = false;

  constructor(
    private readonly env: EngineEnv,
    readonly config: DuelConfig,
    private readonly recording = true
  ) {
    const seed = config.seed.map((s) => BigInt(s)) as [bigint, bigint, bigint, bigint];
    const team = (p: DuelConfig['players'][number]) => ({ startingLP: p.lp, startingDrawCount: p.startHand, drawCountPerTurn: p.drawPerTurn });
    const handle = env.lib.createDuel({
      flags: config.puzzle ? env.flags.mr5 | env.flags.attackFirstTurn : env.flags.mr5,
      seed,
      team1: team(config.players[0]),
      team2: team(config.players[1]),
      cardReader: (code) => env.cards.get(code) ?? null,
      scriptReader: (name) => {
        const source = env.scripts.get(name);
        if (source === undefined && name !== 'c0.lua') this.missingScripts.add(name);
        return source || null;
      },
      errorHandler: (_type, text) => {
        if (this.errors.length < 50) this.errors.push(text);
      },
    });
    if (!handle) throw new Error('Das Duell konnte nicht erstellt werden.');
    this.handle = handle;
    for (const name of BASE_SCRIPTS) env.lib.loadScript(handle, name, env.scripts.get(name) ?? '');
    if (config.puzzle) {
      env.lib.loadScript(handle, 'puzzle.lua', config.puzzle);
    } else {
      config.players.forEach((player, team) => {
        const add = (code: number, location: number) =>
          env.lib.duelNewCard(handle, { team: team as Player, duelist: 0, code, controller: team as Player, location: location as OcgLocation, sequence: 0, position: Pos.FACEDOWN_DEFENSE });
        // Like EDOPro's server, shuffle the decks before handing them to the core.
        const rng = seededRng(Number((BigInt(config.seed[1]) * 31n + BigInt(team + 1)) % 2147483647n));
        shuffled(player.main, rng).forEach((code) => add(code, Loc.DECK));
        player.extra.forEach((code) => add(code, Loc.EXTRA));
      });
    }
    env.lib.startDuel(handle);
    this.advance();
  }

  get ended(): boolean {
    return this.winner !== null;
  }

  /** Answers the current prompt; an invalid answer leaves it open with retry = true. */
  respond(response: EngineResponse): EngineMessage[] {
    if (!this.prompt || this.ended) throw new Error('Es wird gerade keine Entscheidung erwartet.');
    const previous = this.prompt;
    this.env.lib.duelSetResponse(this.handle, toOcgResponse(response));
    this.responses.push(response);
    const messages = this.advance();
    if (messages.length > 0 && messages[0].type === Msg.RETRY) {
      this.responses.pop();
      this.prompt = { ...previous, retry: true };
    }
    return messages;
  }

  /** A copy of this duel at the same point, made by replaying all responses. */
  clone(): DuelSession {
    const copy = new DuelSession(this.env, this.config, false);
    for (const response of this.responses) {
      copy.respond(response);
      if (copy.prompt?.retry) throw new Error('Replay weicht vom Original ab.');
    }
    return copy;
  }

  /** Whether save()/restore() work in this environment. */
  get canSave(): boolean {
    return Boolean(this.env.heap);
  }

  /**
   * Saves this point of the duel. All engine state (Lua included) lives in
   * the WebAssembly memory, so a copy of it is a complete snapshot – much
   * faster than building a new duel and replaying every response.
   * Only valid between calls into the engine, with no other duel created in between.
   */
  save(into?: Uint8Array): SavedSession {
    if (!this.env.heap) throw new Error('Speichern wird hier nicht unterstützt.');
    const heap = this.env.heap();
    // Reusing a buffer of the right size avoids allocating the whole memory again for every save.
    const memory = into && into.length === heap.length ? into : new Uint8Array(heap.length);
    memory.set(heap);
    return {
      memory,
      responses: this.responses.length,
      log: this.log.length,
      prompt: this.prompt,
      winner: this.winner,
      turn: this.turn,
      turnPlayer: this.turnPlayer,
      phase: this.phase,
      chain: [...this.chain],
      hints: [...this.hints],
    };
  }

  restore(saved: SavedSession): void {
    if (!this.env.heap) throw new Error('Wiederherstellen wird hier nicht unterstützt.');
    // The memory may have grown since; the part beyond the saved size is unused again afterwards.
    this.env.heap().set(saved.memory);
    this.responses.length = saved.responses;
    this.log.length = saved.log;
    this.prompt = saved.prompt;
    this.winner = saved.winner;
    this.turn = saved.turn;
    this.turnPlayer = saved.turnPlayer;
    this.phase = saved.phase;
    this.chain = [...saved.chain];
    this.hints[0] = saved.hints[0];
    this.hints[1] = saved.hints[1];
  }

  /** Ends the duel without the engine (surrender, abort). */
  concede(player: Player): void {
    if (this.ended) return;
    this.winner = { player: (1 - player) as Player, reason: -1 };
    this.prompt = null;
    this.record({ k: 'win', player: this.winner.player, reason: -1 });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.env.lib.destroyDuel(this.handle);
  }

  /**
   * The field as one player sees it: hidden cards have code 0. With `reveal`
   * every card is shown and the ones the viewer could not see are marked
   * `hidden` (replay viewer: "show the opponent's cards").
   */
  snapshot(viewer: Player, reveal = false): Snapshot {
    const field = this.env.lib.duelQueryField(this.handle);
    // The field query carries the LP although ocgcore-wasm's typings omit them.
    const lpOf = (p: Player) => signedLp(Number((field.players[p] as unknown as { lp: number }).lp));
    const players = ([0, 1] as Player[]).map((p) => this.playerView(p, viewer, lpOf(p), reveal)) as [PlayerView, PlayerView];
    return { viewer, players, turn: this.turn, turnPlayer: this.turnPlayer, phase: this.phase, chain: [...this.chain] };
  }

  /** Current passcode at a location (0 if empty). */
  codeAt(controller: Player, location: number, sequence: number): number {
    const info = this.env.lib.duelQuery(this.handle, { flags: 0x1, controller, location: location as OcgLocation, sequence, overlaySequence: 0 });
    return info?.code ?? 0;
  }

  private playerView(p: Player, viewer: Player, lp: number, reveal: boolean): PlayerView {
    const query = (location: number) =>
      this.env.lib.duelQueryLocation(this.handle, { flags: QUERY_FLAGS as OcgQueryFlags, controller: p, location: location as OcgLocation });
    const list = (location: number) =>
      query(location)
        .map((info, sequence) => (info ? this.cardView(info, p, location, sequence, viewer, reveal) : null))
        .filter((c): c is CardView => c !== null);
    const slots = (location: number, size: number) => {
      const result: (CardView | null)[] = Array(size).fill(null);
      query(location).forEach((info, sequence) => {
        if (info && sequence < size && info.code) result[sequence] = this.cardView(info, p, location, sequence, viewer, reveal);
      });
      return result;
    };
    return {
      lp,
      hand: list(Loc.HAND),
      mzone: slots(Loc.MZONE, 7),
      szone: slots(Loc.SZONE, 8),
      grave: list(Loc.GRAVE),
      removed: list(Loc.REMOVED),
      extra: list(Loc.EXTRA),
      deckCount: this.env.lib.duelQueryCount(this.handle, p, Loc.DECK),
    };
  }

  private cardView(info: Partial<OcgCardQueryInfo>, controller: Player, location: number, sequence: number, viewer: Player, reveal: boolean): CardView {
    const position = Number(info.position ?? Pos.FACEDOWN_DEFENSE);
    const faceUp = (position & Pos.FACEUP) !== 0;
    const isPublic = Boolean(info.isPublic);
    const onField = location === Loc.MZONE || location === Loc.SZONE;
    const seen =
      controller === viewer ? true : onField ? faceUp || isPublic : location === Loc.GRAVE ? true : location === Loc.REMOVED || location === Loc.EXTRA ? faceUp || isPublic : isPublic;
    const visible = seen || reveal;
    const known = (v: number | undefined) => (visible && v !== undefined ? Number(v) : null);
    return {
      ...(seen ? {} : { hidden: true }),
      code: visible ? Number(info.code ?? 0) : 0,
      controller,
      owner: (info.owner ?? controller) as Player,
      location,
      sequence,
      position,
      type: visible ? Number(this.env.cards.get(Number(info.code ?? 0))?.type ?? 0) : 0,
      attack: known(info.attack),
      defense: known(info.defense),
      baseAttack: known(info.baseAttack),
      baseDefense: known(info.baseDefense),
      materials: (info.overlayCards ?? []).map(Number),
      isPublic,
    };
  }

  /** Runs the engine until it needs a decision or the duel is over. */
  private advance(): EngineMessage[] {
    const out: EngineMessage[] = [];
    this.prompt = null;
    for (let guard = 0; guard < 100000; guard++) {
      const status = this.env.lib.duelProcess(this.handle);
      const batch = this.env.lib.duelGetMessage(this.handle).map(toEngineMessage);
      for (const message of batch) this.observe(message);
      out.push(...batch);
      if (this.winner || status === PROCESS_END) break;
      if (status === PROCESS_WAITING) {
        const last = batch[batch.length - 1];
        if (last && SELECT_TYPES.has(last.type)) {
          const request = last as unknown as SelectRequest;
          this.prompt = { request, hint: this.hints[request.player], retry: false };
          this.hints[request.player] = null;
        }
        break;
      }
    }
    return out;
  }

  private record(entry: LogEntry) {
    if (this.recording) this.log.push(entry);
  }

  private observe(m: EngineMessage) {
    const n = (key: string) => Number(m[key] ?? 0);
    const player = (key = 'player') => n(key) as Player;
    switch (m.type) {
      case Msg.HINT:
        if (n('hint_type') === HintType.SELECTMSG) this.hints[player()] = n('hint');
        break;
      case Msg.WIN:
        this.winner = { player: player(), reason: n('reason') };
        this.record({ k: 'win', player: player(), reason: n('reason') });
        break;
      case Msg.NEW_TURN:
        this.turn++;
        this.turnPlayer = player();
        this.record({ k: 'turn', turn: this.turn, player: player() });
        break;
      case Msg.NEW_PHASE:
        this.phase = n('phase');
        this.record({ k: 'phase', player: this.turnPlayer, phase: this.phase });
        break;
      case Msg.DRAW:
        this.record({ k: 'draw', player: player(), codes: ((m.drawn as { code: number }[]) ?? []).map((d) => Number(d.code)) });
        break;
      case Msg.SUMMONING:
      case Msg.SPSUMMONING:
      case Msg.FLIPSUMMONING: {
        const k = m.type === Msg.SUMMONING ? 'summon' : m.type === Msg.SPSUMMONING ? 'spsummon' : 'flipsummon';
        this.record({ k, player: player('controller'), code: n('code'), location: n('location') });
        break;
      }
      case Msg.SET:
        this.record({ k: 'set', player: player('controller'), code: n('code'), location: n('location'), secret: true });
        break;
      case Msg.CHAINING: {
        const link: ChainLinkView = { code: n('code'), controller: player('controller'), location: n('location'), sequence: n('sequence'), description: n('description') };
        this.chain.push(link);
        this.record({ k: 'activate', player: link.controller, code: link.code, location: link.location, description: link.description, chain: this.chain.length });
        break;
      }
      case Msg.CHAIN_SOLVED:
        this.record({ k: 'resolved', chain: n('chain_size') });
        break;
      case Msg.CHAIN_NEGATED:
      case Msg.CHAIN_DISABLED:
        this.record({ k: 'negated', chain: n('chain_size') });
        break;
      case Msg.CHAIN_END:
        this.chain = [];
        break;
      case Msg.ATTACK: {
        const card = m.card as { controller: Player; location: number; sequence: number };
        const target = m.target as { controller: Player; location: number; sequence: number } | null;
        this.record({
          k: 'attack',
          player: card.controller,
          code: this.codeAt(card.controller, card.location, card.sequence),
          target: target ? this.codeAt(target.controller, target.location, target.sequence) : null,
        });
        break;
      }
      case Msg.DAMAGE:
        this.record({ k: 'damage', player: player(), amount: n('amount') });
        break;
      case Msg.RECOVER:
        this.record({ k: 'recover', player: player(), amount: n('amount') });
        break;
      case Msg.PAY_LPCOST:
        this.record({ k: 'cost', player: player(), amount: n('amount') });
        break;
      case Msg.LPUPDATE:
        this.record({ k: 'lp', player: player(), lp: signedLp(n('lp')) });
        break;
      case Msg.MOVE: {
        const from = m.from as { controller: Player; location: number; position: number };
        const to = m.to as { controller: Player; location: number; position: number };
        if (!from.location || !to.location || from.location === Loc.OVERLAY) break;
        const secret = isHiddenLocation(from.location, from.position) && isHiddenLocation(to.location, to.position);
        this.record({ k: 'move', player: from.controller, code: n('card'), from: from.location, to: to.location, toPlayer: to.controller, secret });
        break;
      }
      case Msg.TOSS_COIN:
        this.record({ k: 'coin', player: player(), results: (m.results as boolean[]) ?? [] });
        break;
      case Msg.TOSS_DICE:
        this.record({ k: 'dice', player: player(), results: ((m.results as number[]) ?? []).map(Number) });
        break;
    }
  }
}
