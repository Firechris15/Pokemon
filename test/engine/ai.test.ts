import assert from 'node:assert/strict';
import { test } from 'node:test';

import { newMemory, sumCombinations, freePlaces, type AiContext } from '@/features/ai/policy';
import { candidateResponses, evaluate, searchResponse } from '@/features/ai/search';
import { puzzleScript } from '@/features/engine/core/puzzleScript';
import { DuelSession, type EngineEnv } from '@/features/engine/core/session';
import { emptyDuel, newInstance } from '@/features/duel/state';
import { Msg } from '@/features/engine/ocg';
import { PRESET_DECKS } from '@/features/engine/presetDecks';
import type { DuelConfig, FromEngine, Player } from '@/features/engine/types';
import { EngineController } from '@/features/engine/worker/controller';
import { samplePuzzles } from '@/features/puzzles/samples';
import { seededRng } from '@/lib/random';

import { fixtureCards, fixtureScripts, loadEnv, loadRuntime } from './env';

const [yugi, kaiba] = PRESET_DECKS;

const cardInfo = (env: EngineEnv) => (code: number) => {
  const c = env.cards.get(code);
  return c ? { type: Number(c.type), attack: c.attack, defense: c.defense, level: c.level } : undefined;
};

function context(env: EngineEnv, session: DuelSession, player: Player, passive: boolean): AiContext {
  return { me: player, snapshot: session.snapshot(player), card: cardInfo(env), rng: seededRng(5), announce: () => 0, memory: newMemory(), passive };
}

function puzzleConfig(env: EngineEnv, id: string, ai: [1 | 2 | null, 1 | 2 | null]): DuelConfig {
  const puzzle = samplePuzzles().find((p) => p.id === id)!;
  const script = puzzleScript(puzzle.initial, (code) => Number(env.cards.get(code)?.type ?? 0));
  const player = (name: string, level: 1 | 2 | null) => ({ name, lp: 8000, main: [], extra: [], startHand: 0, drawPerTurn: 0, ai: level });
  return { seed: ['1', '2', '3', '4'], players: [player('Du', ai[0]), player('Gegner', ai[1])], puzzle: script };
}

test('puzzle scripts recreate the puzzle position in the engine', async () => {
  const env = await loadEnv();
  const session = new DuelSession(env, puzzleConfig(env, 'sample-raigeki', [null, 1]));
  const view = session.snapshot(0);
  assert.equal(view.players[1].lp, 3000);
  assert.equal(view.players[0].mzone[2]?.code, 89631139);
  assert.deepEqual(view.players[1].mzone.slice(0, 5).map((c) => c?.code ?? 0), [0, 91152256, 0, 70781052, 0]);
  assert.equal(view.players[0].hand[0]?.code, 12580477);
  assert.equal(session.prompt?.request.type, Msg.SELECT_IDLECMD, 'puzzle starts in your Main Phase');
  const idle = session.prompt!.request as { activates: { code: number }[] };
  assert.ok(idle.activates.some((a) => a.code === 12580477), 'Raigeki can be activated');
  session.destroy();
});

test('Xyz materials and Extra Monster Zones in puzzle scripts', async () => {
  const env = await loadEnv();
  const state = emptyDuel();
  state.me.monster[1] = newInstance(90448279, 'me', { materials: [newInstance(91152256, 'me'), newInstance(91152256, 'me')] });
  state.emz[0] = newInstance(86066372, 'me');
  state.emz[1] = newInstance(41999284, 'opp');
  const script = puzzleScript(state, (code) => Number(env.cards.get(code)?.type ?? 0));
  const session = new DuelSession(env, { seed: ['1', '2', '3', '4'], players: puzzleConfig(env, 'sample-raigeki', [null, 1]).players, puzzle: script });
  const view = session.snapshot(0);
  assert.deepEqual(session.errors, []);
  assert.equal(view.players[0].mzone[1]?.code, 90448279);
  assert.deepEqual(view.players[0].mzone[1]?.materials, [91152256, 91152256]);
  assert.equal(view.players[0].mzone[5]?.code, 86066372, 'left EMZ is your zone 5');
  assert.equal(view.players[1].mzone[5]?.code, 41999284, 'right EMZ is the opponent zone 5');
  session.destroy();
});

test('face-down cards survive the puzzle script', async () => {
  const env = await loadEnv();
  const base = samplePuzzles().find((p) => p.id === 'sample-mirror-force')!;
  const script = puzzleScript(base.initial, (code) => Number(env.cards.get(code)?.type ?? 0));
  assert.match(script, /=Debug\.AddCard\(44095762,1,1,LOCATION_SZONE,2,POS_FACEDOWN\)/);
  const session = new DuelSession(env, { seed: ['1', '2', '3', '4'], players: puzzleConfig(env, 'sample-raigeki', [null, 1]).players, puzzle: script });
  const view = session.snapshot(0);
  assert.equal(view.players[1].szone[2]?.code, 0, 'the set Mirror Force is hidden from you');
  assert.equal(session.snapshot(1).players[1].szone[2]?.code, 44095762);
  session.destroy();
});

test('level 2 search finds the Raigeki lethal', async () => {
  const env = await loadEnv();
  for (const seed of [1, 2]) {
    const session = new DuelSession(env, puzzleConfig(env, 'sample-raigeki', [2, 1]));
    const rng = seededRng(seed);
    let steps = 0;
    while (session.prompt && !session.ended && steps++ < 200) {
      const player = session.prompt.request.player;
      const searched =
        player === 0
          ? searchResponse(session, 0, { budgetMs: 400, maxSimulations: 60, now: Date.now, rng, card: cardInfo(env), context: (s, p, passive) => context(env, s, p, passive) })
          : null;
      const ctx = context(env, session, player, false);
      session.respond(searched ?? (await import('@/features/ai/policy')).respond(ctx, session.prompt));
    }
    assert.equal(session.winner?.player, 0, `seed ${seed}: the AI solved the puzzle`);
    session.destroy();
  }
});

test('candidate moves and evaluation', async () => {
  const env = await loadEnv();
  const session = new DuelSession(env, puzzleConfig(env, 'sample-raigeki', [null, 1]));
  const candidates = candidateResponses(session.prompt!);
  assert.ok(candidates.length >= 2);
  const view = session.snapshot(0);
  const value = evaluate(view, 0, cardInfo(env));
  assert.ok(value > 0 && value < 1);
  assert.ok(evaluate(view, 0, cardInfo(env)) > evaluate(view, 1, cardInfo(env)) - 0.5);
  session.destroy();
});

test('sum and place helpers', () => {
  const selects = [{ amount: 4 }, { amount: 3 }, { amount: 4 }, { amount: (2 << 16) | 5 }] as never;
  assert.deepEqual(sumCombinations({ selects_must: [], selects, amount: 7, select_max: 0, min: 0, max: 0 })[0], [0, 1]);
  // The last card counts as 5 or 2 (two levels packed into one amount).
  const nine = sumCombinations({ selects_must: [], selects, amount: 9, select_max: 0, min: 0, max: 0 });
  assert.ok(nine.some((c) => c.join() === '0,3'));
  assert.ok(nine.some((c) => c.join() === '0,1,3'));
  const places = freePlaces({ player: 0, field_mask: ~0b00011 & 0xffffffff, count: 1 });
  assert.ok(places.every((p) => p.player === 0 && p.location === 4 && p.sequence <= 1));
});

test('the worker controller plays the AI and asks the human', async () => {
  const rt = await loadRuntime();
  const { cards } = fixtureCards();
  const scripts = [...fixtureScripts(cards).entries()];
  const messages: FromEngine[] = [];
  const controller = new EngineController(rt, (m) => messages.push(m));
  controller.handle({ t: 'init', cards, scripts });
  assert.equal(messages.at(-1)?.t, 'ready');
  const config: DuelConfig = {
    seed: ['21', '2', '3', '4'],
    players: [
      { name: 'Du', lp: 8000, main: yugi.main, extra: yugi.extra, startHand: 5, drawPerTurn: 1, ai: null },
      { name: 'KI', lp: 8000, main: kaiba.main, extra: kaiba.extra, startHand: 5, drawPerTurn: 1, ai: 1 },
    ],
  };
  controller.handle({ t: 'start', config, viewer: 0 });
  const env = await loadEnv();
  const human = { ...context(env, new DuelSession(env, config), 0, false) };
  let guard = 0;
  while (guard++ < 3000) {
    const last = messages.at(-1)!;
    if (last.t === 'end' || last.t === 'error') break;
    assert.equal(last.t, 'update');
    if (last.t !== 'update' || !last.prompt) break;
    assert.equal(last.prompt.request.player, 0, 'only the human player is asked');
    assert.ok(last.snapshot.players[1].hand.every((c) => c.code === 0), 'AI hand stays hidden');
    human.snapshot = last.snapshot;
    controller.handle({ t: 'respond', response: (await import('@/features/ai/policy')).respond(human, last.prompt) });
  }
  const end = messages.at(-1)!;
  assert.equal(end.t, 'end', `duel ended (${guard} prompts)`);
  if (end.t !== 'end') return;
  assert.ok(end.replay.responses.length > 0);
  assert.ok(end.replay.log.some((e) => e.k === 'turn'));
  // The stored responses replay the same duel.
  const replay = new DuelSession(env, end.replay.config);
  for (const response of end.replay.responses) replay.respond(response);
  assert.equal(replay.winner?.player, end.replay.result.winner);
  replay.destroy();
  controller.handle({ t: 'stop' });
});
