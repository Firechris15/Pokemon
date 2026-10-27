import { evaluate } from '@/features/ai/search';
import type { CardInfo } from '@/features/ai/policy';

import { DuelSession, type EngineEnv } from '../core/session';
import { Msg, Pos, Res } from '../ocg';
import type {
  BoardSide,
  BoardSummary,
  DecisionPoint,
  DuelConfig,
  EngineResponse,
  FrameMeta,
  Outcome,
  Player,
  PlayerView,
  ReplayInfo,
  SelectRequest,
  Snapshot,
  Suggestion,
  SuggestionCheck,
} from '../types';

/** A replay run through the engine once: frame metadata, revealed snapshots and the viewer's decisions. */
export type ReplayRun = ReplayInfo & { snapshots: Snapshot[]; winner: Player | null };

/** Decisions worth analysing: main/battle phase, chain chances the player was asked about, yes/no questions. */
export function isDecision(request: SelectRequest, response: EngineResponse): boolean {
  switch (request.type) {
    case Msg.SELECT_IDLECMD:
    case Msg.SELECT_BATTLECMD:
    case Msg.SELECT_EFFECTYN:
    case Msg.SELECT_YESNO:
      return true;
    case Msg.SELECT_CHAIN:
      return !request.forced && request.selects.length > 0 && (request.spe_count > 0 || (response.type === Res.SELECT_CHAIN && response.index !== null));
    default:
      return false;
  }
}

function side(view: PlayerView): BoardSide {
  const code = (c: { code: number; hidden?: boolean }) => (c.hidden ? 0 : c.code);
  return {
    lp: view.lp,
    hand: view.hand.map(code),
    deck: view.deckCount,
    monsters: view.mzone.flatMap((c, zone) =>
      c ? [{ code: code(c), zone, position: c.position, attack: c.hidden ? null : c.attack, defense: c.hidden ? null : c.defense, materials: c.materials.length }] : []
    ),
    spells: view.szone.flatMap((c, zone) => (c ? [{ code: code(c), zone, faceUp: !c.hidden && (c.position & Pos.FACEUP) !== 0 }] : [])),
    grave: view.grave.map(code),
    banished: view.removed.map(code),
    extra: view.extra.length,
  };
}

/** The field as the viewer knew it (snapshots from `snapshot(viewer, true)` carry hidden flags). */
export function boardSummary(snapshot: Snapshot, viewer: Player): BoardSummary {
  return {
    turn: snapshot.turn,
    myTurn: snapshot.turnPlayer === viewer,
    phase: snapshot.phase,
    me: side(snapshot.players[viewer]),
    opp: side(snapshot.players[1 - viewer]),
    chain: snapshot.chain.map((l) => ({ code: l.code, mine: l.controller === viewer })),
  };
}

function meta(session: DuelSession, snapshot: Snapshot): FrameMeta {
  return {
    turn: session.turn,
    turnPlayer: session.turnPlayer,
    phase: session.phase,
    lp: [snapshot.players[0].lp, snapshot.players[1].lp],
    logEnd: session.log.length,
    response: session.responses.length,
  };
}

/**
 * Replays a duel (seed + responses) and records a frame whenever something
 * happened or the viewer had to decide. Stops early if the engine rejects a
 * recorded response, which happens when card scripts changed since the duel.
 */
export function runReplay(env: EngineEnv, config: DuelConfig, responses: EngineResponse[], viewer: Player): ReplayRun {
  const session = new DuelSession(env, config);
  const frames: FrameMeta[] = [];
  const snapshots: Snapshot[] = [];
  const decisions: DecisionPoint[] = [];
  let diverged: number | null = null;
  let winner: Player | null = null;
  const push = () => {
    const snapshot = session.snapshot(viewer, true);
    frames.push(meta(session, snapshot));
    snapshots.push(snapshot);
  };
  try {
    push();
    for (let i = 0; i < responses.length; i++) {
      const prompt = session.prompt;
      if (!prompt) {
        diverged = i;
        break;
      }
      if (prompt.request.player === viewer && isDecision(prompt.request, responses[i])) {
        if (frames[frames.length - 1].response !== i) push();
        decisions.push({
          index: i,
          frame: frames.length - 1,
          request: prompt.request,
          hint: prompt.hint,
          response: responses[i],
          board: boardSummary(snapshots[snapshots.length - 1], viewer),
        });
      }
      const logBefore = session.log.length;
      session.respond(responses[i]);
      if (session.prompt?.retry) {
        diverged = i;
        break;
      }
      if (session.log.length !== logBefore || session.ended) push();
    }
    if (frames[frames.length - 1].response !== session.responses.length) push();
    winner = session.winner?.player ?? null;
  } finally {
    session.destroy();
  }
  return { frames, snapshots, decisions, diverged, winner };
}

/** Outcome of a position from the viewer's side. */
export function outcome(snapshot: Snapshot, viewer: Player, winner: Player | null, card: (code: number) => CardInfo | undefined): Outcome {
  const me = snapshot.players[viewer];
  const opp = snapshot.players[1 - viewer];
  const count = (p: PlayerView) => p.mzone.filter(Boolean).length + p.szone.filter(Boolean).length;
  const score = winner === null ? evaluate(snapshot, viewer, card) : winner === viewer ? 1 : 0;
  return {
    lp: [me.lp, opp.lp],
    field: [count(me), count(opp)],
    hand: [me.hand.length, opp.hand.length],
    winner: winner === null ? null : winner === viewer ? 'me' : 'opp',
    score,
  };
}

const PLAYOUT_STEPS = 2000;

/**
 * Checks an alternative move with the engine: is it legal at that decision,
 * and how does the turn end if both players continue with the level 1 AI?
 * The result is compared with the real duel at the start of the next turn.
 */
export function checkSuggestion(
  env: EngineEnv,
  config: DuelConfig,
  responses: EngineResponse[],
  viewer: Player,
  run: ReplayRun,
  suggestion: Suggestion,
  play: (session: DuelSession, player: Player) => EngineResponse,
  card: (code: number) => CardInfo | undefined
): SuggestionCheck {
  if (run.diverged !== null && suggestion.decision >= run.diverged) return { status: 'unknown', reason: 'Das Replay passt an dieser Stelle nicht mehr zu den Kartenskripten.' };
  if (suggestion.decision < 0 || suggestion.decision >= responses.length) return { status: 'unknown', reason: 'An dieser Stelle gab es keine Entscheidung.' };
  const sim = new DuelSession(env, config, false);
  try {
    for (let i = 0; i < suggestion.decision; i++) {
      if (!sim.prompt) return { status: 'unknown', reason: 'Das Replay passt nicht mehr zu den Kartenskripten.' };
      sim.respond(responses[i]);
      if (sim.prompt?.retry) return { status: 'unknown', reason: 'Das Replay passt nicht mehr zu den Kartenskripten.' };
    }
    if (!sim.prompt || sim.prompt.request.player !== viewer) return { status: 'unknown', reason: 'An dieser Stelle gab es keine Entscheidung.' };
    const turn = sim.turn;
    sim.respond(suggestion.response);
    if (sim.prompt?.retry) return { status: 'illegal' };
    for (let step = 0; step < PLAYOUT_STEPS && sim.prompt && !sim.ended && sim.turn === turn; step++) {
      sim.respond(play(sim, sim.prompt.request.player));
      if (sim.prompt?.retry) return { status: 'unknown', reason: 'Die Simulation ist hängen geblieben.' };
    }
    const alternative = outcome(sim.snapshot(viewer, true), viewer, sim.winner?.player ?? null, card);
    // The real duel at the same point: the first frame of the next turn (or the end).
    const index = run.frames.findIndex((f) => f.turn > turn);
    const at = index < 0 ? run.frames.length - 1 : index;
    const actual = outcome(run.snapshots[at], viewer, index < 0 ? run.winner : null, card);
    return { status: 'ok', turn, actual, alternative };
  } finally {
    sim.destroy();
  }
}
