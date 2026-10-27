import type { CardInfo } from '@/features/ai/policy';
import { candidateResponses } from '@/features/ai/search';

import { DuelSession, type EngineEnv } from '../core/session';
import { BattleAction, IdleAction, Msg, Res } from '../ocg';
import type { DecisionPoint, DecisionReview, DuelConfig, EngineResponse, Outcome, Player, ReplayReview, ReviewVerdict, SelectRequest } from '../types';
import { outcome } from './replay';

/** Plays one side's prompt in a simulation; a fresh one per simulation keeps the comparison fair (same random numbers). */
export type PlayFactory = () => (session: DuelSession, player: Player) => EngineResponse;

const PLAYOUT_STEPS = 2000;

/** Card and effect behind an option: copies of the same card give the same option. */
function optionKey(request: SelectRequest, response: EngineResponse): string {
  const pick = (list: { code: number; description?: number }[], index: number | null) => {
    const c = index === null ? undefined : list[index];
    return c ? `${c.code}:${c.description ?? 0}` : `-`;
  };
  switch (request.type) {
    case Msg.SELECT_IDLECMD: {
      if (response.type !== Res.SELECT_IDLECMD) break;
      const lists: Record<number, { code: number; description?: number }[]> = {
        [IdleAction.SUMMON]: request.summons,
        [IdleAction.SPECIAL_SUMMON]: request.special_summons,
        [IdleAction.POS_CHANGE]: request.pos_changes,
        [IdleAction.MONSTER_SET]: request.monster_sets,
        [IdleAction.SPELL_SET]: request.spell_sets,
        [IdleAction.ACTIVATE]: request.activates,
      };
      return `${response.action}:${lists[response.action] ? pick(lists[response.action], response.index) : '-'}`;
    }
    case Msg.SELECT_BATTLECMD: {
      if (response.type !== Res.SELECT_BATTLECMD) break;
      const list = response.action === BattleAction.CHAIN ? request.chains : response.action === BattleAction.ATTACK ? request.attacks : [];
      return `${response.action}:${pick(list, response.index)}`;
    }
    case Msg.SELECT_CHAIN:
      if (response.type === Res.SELECT_CHAIN) return pick(request.selects, response.index);
      break;
  }
  return JSON.stringify(response);
}

/** Every option of a decision worth comparing (main/battle phase, chain chances, yes/no), one per distinct card and effect. */
export function reviewOptions(request: SelectRequest): EngineResponse[] {
  const all: EngineResponse[] =
    request.type === Msg.SELECT_EFFECTYN
      ? [
          { type: Res.SELECT_EFFECTYN, yes: true },
          { type: Res.SELECT_EFFECTYN, yes: false },
        ]
      : request.type === Msg.SELECT_YESNO
        ? [
            { type: Res.SELECT_YESNO, yes: true },
            { type: Res.SELECT_YESNO, yes: false },
          ]
        : candidateResponses({ request, hint: null, retry: false });
  const seen = new Set<string>();
  return all
    .filter((r) => {
      const key = optionKey(request, r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => directness(a) - directness(b));
}

// On equal results the first option wins, so direct moves come first (activate before set, attack before ending the turn).
const IDLE_ORDER: number[] = [IdleAction.ACTIVATE, IdleAction.SUMMON, IdleAction.SPECIAL_SUMMON, IdleAction.TO_BP, IdleAction.MONSTER_SET, IdleAction.SPELL_SET, IdleAction.POS_CHANGE, IdleAction.TO_EP];
const BATTLE_ORDER: number[] = [BattleAction.ATTACK, BattleAction.CHAIN, BattleAction.TO_M2, BattleAction.TO_EP];

function directness(response: EngineResponse): number {
  if (response.type === Res.SELECT_IDLECMD) return IDLE_ORDER.indexOf(response.action);
  if (response.type === Res.SELECT_BATTLECMD) return BATTLE_ORDER.indexOf(response.action);
  return 0;
}

/**
 * Plays the duel up to a decision, answers it with `response` and lets the
 * level 1 AI continue for both players until the turn ends. null = the
 * engine does not accept the answer (or the replay no longer fits).
 */
function playOption(env: EngineEnv, config: DuelConfig, responses: EngineResponse[], decision: number, response: EngineResponse, viewer: Player, play: PlayFactory, card: (code: number) => CardInfo | undefined): Outcome | null {
  const sim = new DuelSession(env, config, false);
  try {
    for (let i = 0; i < decision; i++) {
      if (!sim.prompt) return null;
      sim.respond(responses[i]);
      if (sim.prompt?.retry) return null;
    }
    if (!sim.prompt) return null;
    const turn = sim.turn;
    sim.respond(response);
    if (sim.prompt?.retry) return null;
    const next = play();
    for (let step = 0; step < PLAYOUT_STEPS && sim.prompt && !sim.ended && sim.turn === turn; step++) {
      sim.respond(next(sim, sim.prompt.request.player));
      if (sim.prompt?.retry) return null;
    }
    return outcome(sim.snapshot(viewer, true), viewer, sim.winner?.player ?? null, card);
  } finally {
    sim.destroy();
  }
}

/** Score difference to the best option → verdict (scores are 0…1 from the evaluation, 1 = won). */
export function verdictFor(chosen: Outcome, best: Outcome | null): { verdict: ReviewVerdict; loss: number } {
  if (!best) return { verdict: 'best', loss: 0 };
  const loss = Math.max(0, best.score - chosen.score);
  if ((best.winner === 'me' && chosen.winner !== 'me') || (chosen.winner === 'opp' && best.winner !== 'opp')) return { verdict: 'blunder', loss: Math.max(loss, 0.2) };
  if (loss >= 0.2) return { verdict: 'blunder', loss };
  if (loss >= 0.08) return { verdict: 'mistake', loss };
  if (loss >= 0.03) return { verdict: 'inaccuracy', loss };
  return { verdict: loss < 0.005 ? 'best' : 'good', loss };
}

/** Compares the chosen answer of one decision with every alternative, all played on with the same AI. */
export function reviewDecision(
  env: EngineEnv,
  config: DuelConfig,
  responses: EngineResponse[],
  viewer: Player,
  decision: DecisionPoint,
  play: PlayFactory,
  card: (code: number) => CardInfo | undefined
): DecisionReview | null {
  const chosenKey = optionKey(decision.request, decision.response);
  const options = reviewOptions(decision.request);
  // Nothing to choose between: not a real decision.
  if (options.length < 2) return null;
  const chosen = playOption(env, config, responses, decision.index, decision.response, viewer, play, card);
  if (!chosen) return null;
  let best: { response: EngineResponse; outcome: Outcome } | null = null;
  let compared = 1;
  for (const response of options) {
    if (optionKey(decision.request, response) === chosenKey) continue;
    const result = playOption(env, config, responses, decision.index, response, viewer, play, card);
    if (!result) continue;
    compared++;
    if (result.score > chosen.score && (!best || result.score > best.outcome.score)) best = { response, outcome: result };
  }
  const { verdict, loss } = verdictFor(chosen, best?.outcome ?? null);
  return {
    index: decision.index,
    frame: decision.frame,
    turn: decision.board.turn,
    verdict,
    loss,
    compared,
    chosen: { response: decision.response, outcome: chosen },
    // Only worth showing when it is clearly better.
    best: verdict === 'best' || verdict === 'good' ? null : best,
  };
}

/** Like Chess.com's accuracy: 100 % for best moves, 0 % for blunders. */
export function summarize(decisions: DecisionReview[], diverged: number | null): ReplayReview {
  const counts: Record<ReviewVerdict, number> = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const d of decisions) counts[d.verdict]++;
  const accuracy = decisions.length ? (decisions.reduce((sum, d) => sum + Math.max(0, 1 - d.loss / 0.2), 0) / decisions.length) * 100 : 100;
  return { version: 1, createdAt: Date.now(), decisions, counts, accuracy: Math.round(accuracy), diverged };
}
