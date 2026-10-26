import assert from 'node:assert/strict';
import { test } from 'node:test';

import { newMemory, respond, type AiContext } from '@/features/ai/policy';
import { DuelSession, type EngineEnv } from '@/features/engine/core/session';
import { Msg, Res } from '@/features/engine/ocg';
import { PRESET_DECKS } from '@/features/engine/presetDecks';
import type { DuelConfig, Player } from '@/features/engine/types';
import { seededRng } from '@/lib/random';

import { loadEnv } from './env';

const [yugi, kaiba] = PRESET_DECKS;

function config(seed = 7): DuelConfig {
  return {
    seed: [String(seed), '2', '3', '4'],
    players: [
      { name: 'A', lp: 8000, main: yugi.main, extra: yugi.extra, startHand: 5, drawPerTurn: 1, ai: 1 },
      { name: 'B', lp: 8000, main: kaiba.main, extra: kaiba.extra, startHand: 5, drawPerTurn: 1, ai: 1 },
    ],
  };
}

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

/** Plays with the level 1 AI on both sides; returns the number of decisions. */
function playOut(env: EngineEnv, session: DuelSession, maxSteps = 4000, seed = 1): number {
  const contexts = [aiContext(env, session, 0, seed), aiContext(env, session, 1, seed + 1)];
  let steps = 0;
  while (session.prompt && !session.ended && steps < maxSteps) {
    const ctx = contexts[session.prompt.request.player];
    ctx.snapshot = session.snapshot(ctx.me);
    session.respond(respond(ctx, session.prompt));
    steps++;
  }
  return steps;
}

test('starts a duel: hands, decks and hidden information', async () => {
  const env = await loadEnv();
  const session = new DuelSession(env, config());
  const view = session.snapshot(0);
  assert.equal(view.turn, 1);
  assert.equal(view.turnPlayer, 0);
  assert.equal(view.players[0].hand.length, 5);
  assert.equal(view.players[1].hand.length, 5);
  assert.equal(view.players[0].deckCount, 35);
  assert.ok(view.players[0].hand.every((c) => c.code !== 0), 'own hand is visible');
  assert.ok(view.players[1].hand.every((c) => c.code === 0), 'opponent hand is hidden');
  assert.equal(view.players[0].lp, 8000);
  assert.equal(session.prompt?.request.player, 0);
  session.destroy();
});

test('level 1 AI plays a full duel to the end', async () => {
  const env = await loadEnv();
  for (const seed of [7, 8, 9]) {
    const session = new DuelSession(env, config(seed));
    const steps = playOut(env, session, 4000, seed);
    assert.ok(session.ended, `duel ${seed} ended after ${steps} decisions`);
    assert.ok(session.turn >= 2);
    assert.equal(session.log.filter((e) => e.k === 'win').length, 1);
    assert.ok(session.log.some((e) => e.k === 'summon' || e.k === 'spsummon'), 'monsters were summoned');
    assert.ok(session.log.some((e) => e.k === 'attack'), 'monsters attacked');
    session.destroy();
  }
});

test('a clone made by replaying the responses is identical', async () => {
  const env = await loadEnv();
  const session = new DuelSession(env, config(11));
  playOut(env, session, 60, 3);
  const copy = session.clone();
  assert.deepEqual(copy.snapshot(0), session.snapshot(0));
  assert.deepEqual(copy.snapshot(1), session.snapshot(1));
  assert.deepEqual(copy.prompt?.request, session.prompt?.request);
  copy.destroy();
  session.destroy();
});

test('an invalid response is rejected and the prompt stays open', async () => {
  const env = await loadEnv();
  const session = new DuelSession(env, config());
  assert.equal(session.prompt?.request.type, Msg.SELECT_IDLECMD);
  const before = session.responses.length;
  session.respond({ type: Res.SELECT_IDLECMD, action: 0, index: 99 });
  assert.equal(session.prompt?.retry, true);
  assert.equal(session.responses.length, before);
  assert.equal(session.prompt?.request.type, Msg.SELECT_IDLECMD);
  session.destroy();
});

test('surrender ends the duel for the other player', async () => {
  const env = await loadEnv();
  const session = new DuelSession(env, config());
  session.concede(0);
  assert.deepEqual(session.winner, { player: 1, reason: -1 });
  session.destroy();
});
