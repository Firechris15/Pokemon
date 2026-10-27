import assert from 'node:assert/strict';
import { test } from 'node:test';

import { newMemory, respond, type AiContext } from '@/features/ai/policy';
import { puzzleScript } from '@/features/engine/core/puzzleScript';
import { DuelSession, type EngineEnv } from '@/features/engine/core/session';
import { IdleAction, Msg, Res } from '@/features/engine/ocg';
import { PRESET_DECKS } from '@/features/engine/presetDecks';
import type { DuelConfig, EngineResponse, FromEngine, Player, ReplayData, SelectIdleCmd } from '@/features/engine/types';
import { EngineController } from '@/features/engine/worker/controller';
import { runReplay } from '@/features/engine/worker/replay';
import { samplePuzzles } from '@/features/puzzles/samples';
import { matchStats } from '@/features/replays/stats';
import { seededRng } from '@/lib/random';

import { fixtureCards, fixtureScripts, loadEnv, loadRuntime } from './env';

const [yugi, kaiba] = PRESET_DECKS;

function aiContext(env: EngineEnv, session: DuelSession, player: Player, seed: number): AiContext {
  return {
    me: player,
    snapshot: session.snapshot(player),
    card: (code) => {
      const c = env.cards.get(code);
      return c ? { type: Number(c.type), attack: c.attack, defense: c.defense, level: c.level } : undefined;
    },
    rng: seededRng(seed),
    announce: () => 0,
    memory: newMemory(),
  };
}

/** Plays a duel with the level 1 AI on both sides (player 0 stands in for the app user). */
function recordDuel(env: EngineEnv, seed: number): { config: DuelConfig; responses: EngineResponse[]; session: DuelSession } {
  const config: DuelConfig = {
    seed: [String(seed), '5', '6', '7'],
    players: [
      { name: 'Du', lp: 8000, main: yugi.main, extra: yugi.extra, startHand: 5, drawPerTurn: 1, ai: null },
      { name: 'KI', lp: 8000, main: kaiba.main, extra: kaiba.extra, startHand: 5, drawPerTurn: 1, ai: 1 },
    ],
  };
  const session = new DuelSession(env, config);
  const contexts = [aiContext(env, session, 0, seed), aiContext(env, session, 1, seed + 1)];
  for (let steps = 0; session.prompt && !session.ended && steps < 4000; steps++) {
    const ctx = contexts[session.prompt.request.player];
    ctx.snapshot = session.snapshot(ctx.me);
    session.respond(respond(ctx, session.prompt));
  }
  return { config, responses: [...session.responses], session };
}

function raigekiConfig(env: EngineEnv): DuelConfig {
  const puzzle = samplePuzzles().find((p) => p.id === 'sample-raigeki')!;
  const script = puzzleScript(puzzle.initial, (code) => Number(env.cards.get(code)?.type ?? 0));
  const player = (name: string, ai: 1 | null) => ({ name, lp: 8000, main: [], extra: [], startHand: 0, drawPerTurn: 0, ai });
  return { seed: ['1', '2', '3', '4'], players: [player('Du', null), player('KI', 1)], puzzle: script };
}

test('a replay run rebuilds every step of the duel', async () => {
  const env = await loadEnv();
  const { config, responses, session } = recordDuel(env, 11);
  assert.ok(session.ended);
  const run = runReplay(env, config, responses, 0);
  assert.equal(run.diverged, null);
  assert.equal(run.winner, session.winner?.player);
  const last = run.frames.at(-1)!;
  const final = session.snapshot(0);
  assert.deepEqual(last.lp, [final.players[0].lp, final.players[1].lp]);
  assert.equal(last.logEnd, session.log.length);
  assert.equal(last.response, responses.length);
  for (let i = 1; i < run.frames.length; i++) {
    assert.ok(run.frames[i].logEnd >= run.frames[i - 1].logEnd);
    assert.ok(run.frames[i].response > run.frames[i - 1].response || i === run.frames.length - 1);
  }
  assert.equal(run.snapshots.length, run.frames.length);

  // The viewer's decisions point at frames taken right before them.
  assert.ok(run.decisions.length > 5);
  for (const d of run.decisions) {
    assert.equal(d.request.player, 0);
    assert.equal(run.frames[d.frame].response, d.index);
    assert.deepEqual(d.response, responses[d.index]);
    assert.equal(d.board.me.lp, run.frames[d.frame].lp[0]);
  }
  assert.ok(run.decisions.some((d) => d.request.type === Msg.SELECT_IDLECMD));
  assert.ok(run.decisions.every((d) => d.board.opp.hand.every((code) => code === 0)), 'the AI hand stays unknown in decisions');

  // Revealed snapshots show the AI's hand, marked as hidden information.
  const start = run.snapshots[0];
  assert.ok(start.players[1].hand.length === 5 && start.players[1].hand.every((c) => c.code !== 0 && c.hidden));
  assert.ok(start.players[0].hand.every((c) => !c.hidden));

  // LP tracked from the log match the engine.
  const stats = matchStats({ config, responses, log: session.log, result: { winner: run.winner, reason: '' }, turns: session.turn }, 0);
  assert.deepEqual([stats.lpByTurn.at(-1)!.me, stats.lpByTurn.at(-1)!.opp], last.lp.map((v) => Math.max(0, v)));
  assert.equal(stats.firstPlayer, 'me');
  assert.equal(stats.turns, session.turn);
  session.destroy();
});

test('a replay that no longer fits the engine stops where it diverges', async () => {
  const env = await loadEnv();
  const { config, responses, session } = recordDuel(env, 12);
  session.destroy();
  const k = responses.findIndex((r, i) => i > 3 && r.type === Res.SELECT_IDLECMD);
  const broken = [...responses];
  broken[k] = { type: Res.SELECT_IDLECMD, action: IdleAction.ACTIVATE, index: 99 };
  const run = runReplay(env, config, broken, 0);
  assert.equal(run.diverged, k);
  assert.equal(run.frames.at(-1)!.response, k);
});

test('the engine checks suggested moves and plays them out', async () => {
  const rt = await loadRuntime();
  const env = await loadEnv();
  // Recorded line: the player ends the turn without playing Raigeki and loses the puzzle.
  const config = raigekiConfig(env);
  const session = new DuelSession(env, config);
  const idle = session.prompt!.request as SelectIdleCmd;
  const raigeki = idle.activates.findIndex((a) => a.code === 12580477);
  assert.ok(raigeki >= 0);
  session.respond({ type: Res.SELECT_IDLECMD, action: IdleAction.TO_EP, index: null });
  const ctx = aiContext(env, session, 1, 3);
  for (let steps = 0; session.prompt && !session.ended && steps < 200; steps++) {
    ctx.snapshot = session.snapshot(session.prompt.request.player);
    ctx.me = session.prompt.request.player;
    session.respond(respond(ctx, session.prompt));
  }
  assert.equal(session.winner?.player, 1, 'the recorded line loses');
  const data: ReplayData = { config, responses: [...session.responses], log: [...session.log], result: { winner: 1, reason: '' }, turns: session.turn };
  session.destroy();

  const { cards } = fixtureCards();
  const messages: FromEngine[] = [];
  const controller = new EngineController(rt, (m) => messages.push(m));
  controller.handle({ t: 'init', cards, scripts: [...fixtureScripts(cards).entries()] });
  controller.handle({ t: 'replay', id: 'r1', config: data.config, responses: data.responses, viewer: 0 });
  const info = messages.at(-1)!;
  assert.equal(info.t, 'replayInfo');
  if (info.t !== 'replayInfo') return;
  assert.equal(info.info.decisions[0].index, 0);

  controller.handle({ t: 'frame', id: 'r1', index: 0 });
  const frame = messages.at(-1)!;
  assert.ok(frame.t === 'frame' && frame.snapshot.players[0].hand.some((c) => c.code === 12580477));

  controller.handle({
    t: 'verify',
    id: 'r1',
    suggestions: [
      { decision: 0, response: { type: Res.SELECT_IDLECMD, action: IdleAction.ACTIVATE, index: raigeki } },
      { decision: 0, response: { type: Res.SELECT_IDLECMD, action: IdleAction.ACTIVATE, index: 42 } },
      { decision: 999, response: { type: Res.SELECT_IDLECMD, action: IdleAction.TO_EP, index: null } },
    ],
  });
  const verified = messages.at(-1)!;
  assert.equal(verified.t, 'verified', JSON.stringify(verified));
  if (verified.t !== 'verified') return;
  const [good, illegal, unknown] = verified.results;
  assert.equal(good.status, 'ok');
  if (good.status === 'ok') {
    assert.equal(good.alternative.winner, 'me', 'Raigeki and attacking wins the puzzle');
    assert.equal(good.actual.winner, 'opp');
    assert.ok(good.alternative.score > good.actual.score);
  }
  assert.equal(illegal.status, 'illegal');
  assert.equal(unknown.status, 'unknown');

  controller.handle({ t: 'frame', id: 'other', index: 0 });
  assert.equal(messages.at(-1)!.t, 'replayError');
  controller.handle({ t: 'closeReplay' });
});
