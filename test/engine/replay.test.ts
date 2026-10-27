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
import { Reviewer, reviewOptions, summarize, verdictFor } from '@/features/engine/worker/review';
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

test('the engine review rates every decision against the alternatives', async () => {
  const rt = await loadRuntime();
  const env = await loadEnv();
  // Raigeki puzzle: ending the turn instead of playing Raigeki throws the win away.
  const config = raigekiConfig(env);
  const session = new DuelSession(env, config);
  session.respond({ type: Res.SELECT_IDLECMD, action: IdleAction.TO_EP, index: null });
  const ctx = aiContext(env, session, 1, 3);
  for (let steps = 0; session.prompt && !session.ended && steps < 200; steps++) {
    ctx.me = session.prompt.request.player;
    ctx.snapshot = session.snapshot(ctx.me);
    session.respond(respond(ctx, session.prompt));
  }
  const responses = [...session.responses];
  session.destroy();

  const { cards } = fixtureCards();
  const messages: FromEngine[] = [];
  const controller = new EngineController(rt, (m) => messages.push(m));
  controller.handle({ t: 'init', cards, scripts: [...fixtureScripts(cards).entries()] });
  controller.handle({ t: 'replay', id: 'p', config, responses, viewer: 0 });
  controller.handle({ t: 'review', id: 'p' });
  for (let i = 0; i < 200 && !messages.some((m) => m.t === 'reviewed' || m.t === 'replayError'); i++) await new Promise((r) => setTimeout(r, 20));
  const done = messages.find((m) => m.t === 'reviewed');
  assert.ok(done && done.t === 'reviewed', JSON.stringify(messages.at(-1)));
  assert.ok(messages.some((m) => m.t === 'reviewProgress'));
  const first = done.review.decisions[0];
  assert.equal(first.index, 0);
  assert.equal(first.verdict, 'blunder', 'ending the turn misses the lethal');
  assert.equal(first.chosen.outcome.winner, 'opp');
  assert.equal(first.best?.outcome.winner, 'me');
  assert.deepEqual(first.best?.response, { type: Res.SELECT_IDLECMD, action: IdleAction.ACTIVATE, index: 0 });
  assert.ok(done.review.accuracy < 50);
  assert.equal(done.review.counts.blunder, 1);
  controller.handle({ t: 'closeReplay' });
});

test('a full duel review finishes and every decision gets a verdict', async () => {
  const env = await loadEnv();
  const { config, responses, session } = recordDuel(env, 13);
  session.destroy();
  const run = runReplay(env, config, responses, 0);
  const card = (code: number) => {
    const c = env.cards.get(code);
    return c ? { type: Number(c.type), attack: c.attack, defense: c.defense, level: c.level } : undefined;
  };
  const playFor = (index: number) => () => {
    const memory = newMemory();
    const rng = seededRng(index);
    return (sim: DuelSession, player: Player) => respond({ me: player, snapshot: sim.snapshot(player), card, rng, announce: () => 0, memory }, sim.prompt!);
  };
  const reviewAll = (e: EngineEnv) => {
    const reviewer = new Reviewer(e, config, responses, 0, playFor, card);
    const started = Date.now();
    const reviews = run.decisions.map((d) => reviewer.review(d)).filter((r) => r !== null);
    reviewer.destroy();
    return { reviews, ms: Date.now() - started };
  };
  // Saving/restoring the engine memory gives the same verdicts as replaying every option.
  const fast = reviewAll(env);
  const slow = reviewAll({ ...env, heap: undefined });
  assert.deepEqual(fast.reviews, slow.reviews);
  const review = summarize(fast.reviews, run.diverged);
  assert.equal(fast.reviews.length, run.decisions.filter((d) => reviewOptions(d.request).length > 1).length);
  assert.equal(Object.values(review.counts).reduce((a, b) => a + b, 0), fast.reviews.length);
  assert.ok(review.accuracy >= 0 && review.accuracy <= 100);
  for (const r of fast.reviews) {
    assert.ok(r.compared >= 1);
    if (r.best) assert.ok(r.best.outcome.score > r.chosen.outcome.score);
  }
  console.log(`# reviewed ${fast.reviews.length} decisions (${responses.length} responses): ${fast.ms} ms with saved states, ${slow.ms} ms replaying, accuracy ${review.accuracy} %`);
});

test('a saved duel continues exactly like the original after restores', async () => {
  const env = await loadEnv();
  const { config, responses, session } = recordDuel(env, 14);
  const final = session.snapshot(0, true);
  session.destroy();
  const base = new DuelSession(env, config, false);
  for (let i = 0; i < responses.length; i++) {
    if (i % 5 === 0 && base.prompt) {
      const saved = base.save();
      // Wander off: play something else for a few steps, then come back.
      const other = reviewOptions(base.prompt.request).at(-1);
      if (other) base.respond(other);
      base.restore(saved);
    }
    base.respond(responses[i]);
  }
  assert.deepEqual(base.snapshot(0, true), final);
  base.destroy();
});

test('review verdicts and options', () => {
  const o = (score: number, winner: 'me' | 'opp' | null = null) => ({ lp: [8000, 8000] as [number, number], field: [0, 0] as [number, number], hand: [0, 0] as [number, number], winner, score });
  assert.deepEqual(verdictFor(o(0.5), null), { verdict: 'best', loss: 0 });
  assert.equal(verdictFor(o(0.5), o(0.502)).verdict, 'best');
  assert.equal(verdictFor(o(0.5), o(0.52)).verdict, 'good');
  assert.equal(verdictFor(o(0.5), o(0.55)).verdict, 'inaccuracy');
  assert.equal(verdictFor(o(0.5), o(0.6)).verdict, 'mistake');
  assert.equal(verdictFor(o(0.5), o(0.75)).verdict, 'blunder');
  assert.equal(verdictFor(o(0.6), o(1, 'me')).verdict, 'blunder', 'missed lethal');
  assert.equal(verdictFor(o(0, 'opp'), o(0.3)).verdict, 'blunder', 'lost the duel this turn');
  const twoCopies = {
    type: Msg.SELECT_IDLECMD,
    player: 0,
    summons: [
      { code: 5, controller: 0, location: 2, sequence: 0 },
      { code: 5, controller: 0, location: 2, sequence: 1 },
    ],
    special_summons: [],
    pos_changes: [],
    monster_sets: [],
    spell_sets: [],
    activates: [],
    to_bp: false,
    to_ep: true,
    shuffle: false,
  } as SelectIdleCmd;
  assert.equal(reviewOptions(twoCopies).length, 2, 'copies of a card are compared once');
  assert.equal(summarize([], null).accuracy, 100);
});
