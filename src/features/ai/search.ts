import type { DuelSession } from '@/features/engine/core/session';
import { BattleAction, IdleAction, Msg, Pos, Res } from '@/features/engine/ocg';
import type { EngineResponse, Player, Prompt, Snapshot } from '@/features/engine/types';

import { cardValue, respond, type AiContext, type CardInfo } from './policy';

/** The decisions the search looks at: main/battle phase actions and chain responses. */
export function candidateResponses(prompt: Prompt): EngineResponse[] {
  const r = prompt.request;
  switch (r.type) {
    case Msg.SELECT_IDLECMD: {
      const out: EngineResponse[] = [];
      const add = (action: number, list: unknown[]) => list.forEach((_, index) => out.push({ type: Res.SELECT_IDLECMD, action, index }));
      add(IdleAction.SUMMON, r.summons);
      add(IdleAction.SPECIAL_SUMMON, r.special_summons);
      add(IdleAction.POS_CHANGE, r.pos_changes);
      add(IdleAction.MONSTER_SET, r.monster_sets);
      add(IdleAction.SPELL_SET, r.spell_sets);
      add(IdleAction.ACTIVATE, r.activates);
      if (r.to_bp) out.push({ type: Res.SELECT_IDLECMD, action: IdleAction.TO_BP, index: null });
      if (r.to_ep) out.push({ type: Res.SELECT_IDLECMD, action: IdleAction.TO_EP, index: null });
      return out;
    }
    case Msg.SELECT_BATTLECMD: {
      const out: EngineResponse[] = [];
      r.attacks.forEach((_, index) => out.push({ type: Res.SELECT_BATTLECMD, action: BattleAction.ATTACK, index }));
      r.chains.forEach((_, index) => out.push({ type: Res.SELECT_BATTLECMD, action: BattleAction.CHAIN, index }));
      if (r.to_m2) out.push({ type: Res.SELECT_BATTLECMD, action: BattleAction.TO_M2, index: null });
      if (r.to_ep) out.push({ type: Res.SELECT_BATTLECMD, action: BattleAction.TO_EP, index: null });
      return out;
    }
    case Msg.SELECT_CHAIN:
      if (r.forced || r.selects.length === 0) return [];
      return [{ type: Res.SELECT_CHAIN, index: null }, ...r.selects.map((_, index) => ({ type: Res.SELECT_CHAIN, index }) as EngineResponse)];
    default:
      return [];
  }
}

/** 0 … 1 from the player's point of view: LP, board and card advantage. */
export function evaluate(snapshot: Snapshot, me: Player, card: (code: number) => CardInfo | undefined): number {
  const opp = (1 - me) as Player;
  const mine = snapshot.players[me];
  const theirs = snapshot.players[opp];
  if (theirs.lp <= 0 && mine.lp > 0) return 1;
  if (mine.lp <= 0) return 0;
  const board = (p: typeof mine) =>
    p.mzone.reduce((sum, c) => {
      if (!c) return sum;
      if (c.code === 0) return sum + 1500;
      const info = card(c.code);
      const stat = c.position & Pos.DEFENSE ? (c.defense ?? info?.defense ?? 0) * 0.6 : (c.attack ?? info?.attack ?? 0);
      return sum + stat + 300;
    }, 0) +
    p.szone.filter(Boolean).length * 400;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const lp = clamp((mine.lp - theirs.lp) / 8000);
  const field = clamp((board(mine) - board(theirs)) / 8000);
  const count = (p: typeof mine) => p.hand.length + p.mzone.filter(Boolean).length + p.szone.filter(Boolean).length;
  const cards = clamp((count(mine) - count(theirs)) / 8);
  const handValue = clamp(mine.hand.reduce((s, c) => s + cardValue(card(c.code)), 0) / 20000);
  return Math.max(0, Math.min(1, 0.5 + 0.3 * lp + 0.12 * field + 0.06 * cards + 0.02 * handValue));
}

export type SearchOptions = {
  budgetMs: number;
  maxSimulations: number;
  now: () => number;
  rng: () => number;
  /** AI context for a player inside a simulation. */
  context: (session: DuelSession, player: Player, passive: boolean) => AiContext;
  card: (code: number) => CardInfo | undefined;
};

const PLAYOUT_STEPS = 300;

/**
 * Level 2: Monte Carlo tree search over the next decision (one ply, UCB1).
 * Each simulation replays the duel, plays the candidate and continues with
 * the level 1 policy until the current turn ends. The other player never
 * chains in simulations, so hidden hand traps are not "foreseen".
 */
export function searchResponse(session: DuelSession, me: Player, options: SearchOptions): EngineResponse | null {
  const prompt = session.prompt;
  if (!prompt || prompt.request.player !== me) return null;
  const candidates = candidateResponses(prompt);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const stats = candidates.map(() => ({ visits: 0, total: 0 }));
  const deadline = options.now() + options.budgetMs;
  const startTurn = session.turn;
  let simulations = 0;

  while (simulations < options.maxSimulations && (simulations < candidates.length || options.now() < deadline)) {
    const untried = stats.findIndex((s) => s.visits === 0);
    let choice = untried;
    if (choice < 0) {
      const logN = Math.log(simulations);
      let best = -Infinity;
      stats.forEach((s, i) => {
        const ucb = s.total / s.visits + 0.7 * Math.sqrt(logN / s.visits) + options.rng() * 1e-6;
        if (ucb > best) {
          best = ucb;
          choice = i;
        }
      });
    }
    const sim = session.clone();
    let score = 0.5;
    try {
      sim.respond(candidates[choice]);
      if (sim.prompt?.retry) {
        score = 0;
      } else {
        playout(sim, me, startTurn, options);
        score = sim.winner ? (sim.winner.player === me ? 1 : 0) : evaluate(sim.snapshot(me), me, options.card);
      }
    } finally {
      sim.destroy();
    }
    stats[choice].visits++;
    stats[choice].total += score;
    simulations++;
    if (options.now() >= deadline && simulations >= candidates.length) break;
  }

  let bestIndex = 0;
  let bestMean = -Infinity;
  stats.forEach((s, i) => {
    const mean = s.visits ? s.total / s.visits : -1;
    if (mean > bestMean) {
      bestMean = mean;
      bestIndex = i;
    }
  });
  return candidates[bestIndex];
}

function playout(sim: DuelSession, me: Player, startTurn: number, options: SearchOptions) {
  const contexts = new Map<string, AiContext>();
  for (let step = 0; step < PLAYOUT_STEPS && sim.prompt && !sim.ended; step++) {
    if (sim.turn > startTurn) break;
    const player = sim.prompt.request.player;
    const passive = player !== me;
    const key = `${player}`;
    const ctx = contexts.get(key) ?? options.context(sim, player, passive);
    contexts.set(key, ctx);
    ctx.snapshot = sim.snapshot(player);
    sim.respond(respond(ctx, sim.prompt));
  }
}
