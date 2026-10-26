import { resolveBattle } from '@/features/duel/battle';
import { buildMove, extraSummonAction, isError, resolvesToGy, type Intent } from '@/features/duel/builder';
import { describeMove, movesMatch } from '@/features/duel/moves';
import { applyMove, cardsIn, emptyDuel, locate, monstersOf, newInstance } from '@/features/duel/state';
import type { DuelMove, DuelState, Side } from '@/features/duel/types';

import { ID, puzzleCardMap } from './helpers';

const cards = puzzleCardMap();
const cardOf = (id: number) => cards.get(id);
const nameOf = (id: number) => cards.get(id)?.nameEn ?? String(id);

const BEWD = 89631139;
const CELTIC = 91152256;
const SKULL = 70781052;
const RAIGEKI = 12580477;
const MST = 5318639;
const POLY = 24094653;
const THOUSAND = 41462083;

function place(state: DuelState, side: Side, zone: 'monster' | 'spell', index: number, cardId: number, options = {}) {
  const card = newInstance(cardId, side, options);
  state[side][zone][index] = card;
  return card;
}

function build(state: DuelState, intent: Intent): DuelMove {
  const result = buildMove(state, intent, cardOf);
  if (isError(result)) throw new Error(result.error);
  return result;
}

describe('duel state', () => {
  it('summons from the hand and sends tributes to the GY', () => {
    let state = emptyDuel();
    const skull = newInstance(SKULL, 'me');
    state.me.hand.push(skull);
    const tribute = place(state, 'me', 'monster', 2, CELTIC);
    state = applyMove(state, build(state, { kind: 'normal_summon', actor: 'me', uid: skull.uid, tributes: [tribute.uid] }));
    expect(state.me.hand).toHaveLength(0);
    expect(cardsIn(state, { side: 'me', zone: 'monster' }).map((c) => c.cardId)).toEqual([SKULL]);
    expect(state.me.gy.map((c) => c.cardId)).toEqual([CELTIC]);
  });

  it('keeps a card where it was if the target zone is full', () => {
    let state = emptyDuel();
    for (let i = 0; i < 5; i++) place(state, 'me', 'monster', i, CELTIC);
    state.me.hand.push(newInstance(BEWD, 'me'));
    const move: DuelMove = { id: 'm', actor: 'me', action: 'special_summon', cardId: BEWD, from: { side: 'me', zone: 'hand', index: 0 }, to: { side: 'me', zone: 'monster' }, targets: [], auto: false, note: '' };
    state = applyMove(state, move);
    expect(state.me.hand.map((c) => c.cardId)).toEqual([BEWD]);
  });

  it('attaches Xyz materials and sends them to the GY when the Xyz monster leaves', () => {
    let state = emptyDuel();
    const zeus = newInstance(ID.zeus, 'me');
    state.me.extra.push(zeus);
    const a = place(state, 'me', 'monster', 0, CELTIC);
    const b = place(state, 'me', 'monster', 1, CELTIC);
    state = applyMove(state, build(state, { kind: 'extra_summon', actor: 'me', uid: zeus.uid, action: 'xyz_summon', materials: [a.uid, b.uid] }));
    const xyz = locate(state, zeus.uid)!;
    expect(xyz.loc.zone).toBe('emz');
    expect(xyz.card.materials).toHaveLength(2);
    expect(state.me.gy).toHaveLength(0);
    state = applyMove(state, build(state, { kind: 'banish', actor: 'me', uid: zeus.uid }));
    expect(state.me.banished.map((c) => c.cardId)).toEqual([ID.zeus]);
    expect(state.me.gy.map((c) => c.cardId)).toEqual([CELTIC, CELTIC]);
  });

  it('uses a material zone when every Monster Zone is taken', () => {
    let state = emptyDuel();
    for (let i = 0; i < 5; i++) place(state, 'me', 'monster', i, CELTIC);
    state.emz = [newInstance(BEWD, 'opp'), newInstance(BEWD, 'me')];
    const link = newInstance(ID.accesscode, 'me');
    state.me.extra.push(link);
    const material = state.me.monster[3]!;
    state = applyMove(state, build(state, { kind: 'extra_summon', actor: 'me', uid: link.uid, action: 'link_summon', materials: [material.uid] }));
    expect(state.me.monster[3]?.cardId).toBe(ID.accesscode);
  });

  it('takes control without changing the owner', () => {
    let state = emptyDuel();
    const skull = place(state, 'opp', 'monster', 2, SKULL);
    state = applyMove(state, build(state, { kind: 'take_control', actor: 'me', uid: skull.uid }));
    expect(monstersOf(state, 'me').map((m) => m.card.cardId)).toEqual([SKULL]);
    state = applyMove(state, build(state, { kind: 'destroy', actor: 'me', uid: skull.uid }));
    expect(state.opp.gy.map((c) => c.cardId)).toEqual([SKULL]);
  });

  it('clamps life points at zero', () => {
    let state = emptyDuel();
    state.opp.lp = 1000;
    const attacker = place(state, 'me', 'monster', 0, BEWD);
    state = applyMove(state, build(state, { kind: 'attack', actor: 'me', uid: attacker.uid, targetUid: null }));
    expect(state.opp.lp).toBe(0);
  });
});

describe('battle', () => {
  const setup = (attackerId: number, defenderId: number, defender: { defense?: boolean; faceUp?: boolean } = {}) => {
    const state = emptyDuel();
    const a = place(state, 'me', 'monster', 0, attackerId);
    const d = place(state, 'opp', 'monster', 0, defenderId, defender);
    return resolveBattle(locate(state, a.uid)!, locate(state, d.uid)!, cardOf);
  };

  it('destroys the weaker attack position monster and deals the difference', () => {
    const win = setup(BEWD, SKULL);
    expect(win.targets[0].to).toEqual({ side: 'opp', zone: 'gy' });
    expect(win.lp).toEqual({ me: 0, opp: -500 });
    const lose = setup(CELTIC, SKULL);
    expect(lose.attackerTo).toEqual({ side: 'me', zone: 'gy' });
    expect(lose.lp).toEqual({ me: -1100, opp: 0 });
  });

  it('destroys both monsters on equal ATK', () => {
    const tie = setup(SKULL, SKULL);
    expect(tie.attackerTo).not.toBeNull();
    expect(tie.targets[0].to).not.toBeNull();
    expect(tie.lp).toEqual({ me: 0, opp: 0 });
  });

  it('handles defense position, including face-down monsters', () => {
    const pierce = setup(SKULL, CELTIC, { defense: true, faceUp: false });
    expect(pierce.targets[0].to).toEqual({ side: 'opp', zone: 'gy' });
    expect(pierce.lp).toEqual({ me: 0, opp: 0 });
    const bounce = setup(CELTIC, BEWD, { defense: true, faceUp: false });
    expect(bounce.targets[0]).toMatchObject({ to: null, faceUp: true });
    expect(bounce.lp).toEqual({ me: -1100, opp: 0 });
  });

  it('uses adjusted ATK values', () => {
    const state = emptyDuel();
    const a = place(state, 'me', 'monster', 0, CELTIC, { atk: 2600 });
    const d = place(state, 'opp', 'monster', 0, SKULL);
    expect(resolveBattle(locate(state, a.uid)!, locate(state, d.uid)!, cardOf).lp).toEqual({ me: 0, opp: -100 });
  });
});

describe('move builder', () => {
  it('sends resolving spells to the GY and keeps continuous/field spells', () => {
    expect(resolvesToGy(cardOf(RAIGEKI))).toBe(true);
    expect(resolvesToGy(cardOf(ID.called))).toBe(true);
    expect(resolvesToGy(cardOf(ID.snakeEyeFire))).toBe(false);
    expect(resolvesToGy(cardOf(ID.imperm))).toBe(true);
    const state = emptyDuel();
    const fire = newInstance(ID.snakeEyeFire, 'me');
    state.me.hand.push(fire);
    expect(build(state, { kind: 'activate', actor: 'me', uid: fire.uid }).to).toMatchObject({ side: 'me', zone: 'spell' });
  });

  it('discards hand traps when activated from the hand', () => {
    const state = emptyDuel();
    const ash = newInstance(ID.ash, 'opp');
    state.opp.hand.push(ash);
    expect(build(state, { kind: 'activate', actor: 'opp', uid: ash.uid }).to).toEqual({ side: 'opp', zone: 'gy' });
  });

  it('knows the summon type of Extra Deck monsters', () => {
    expect(extraSummonAction(cardOf(ID.accesscode))).toBe('link_summon');
    expect(extraSummonAction(cardOf(ID.zeus))).toBe('xyz_summon');
    expect(extraSummonAction(cardOf(ID.baronne))).toBe('synchro_summon');
    expect(extraSummonAction(cardOf(THOUSAND))).toBe('fusion_summon');
    expect(extraSummonAction(cardOf(BEWD))).toBeNull();
  });

  it('rejects impossible requests with a message', () => {
    const state = emptyDuel();
    const skull = place(state, 'me', 'monster', 0, SKULL);
    const set = place(state, 'me', 'monster', 1, CELTIC, { faceUp: false, defense: true });
    const opp = place(state, 'opp', 'monster', 0, BEWD);
    expect(buildMove(state, { kind: 'normal_summon', actor: 'me', uid: skull.uid }, cardOf)).toHaveProperty('error');
    expect(buildMove(state, { kind: 'attack', actor: 'me', uid: set.uid, targetUid: null }, cardOf)).toHaveProperty('error');
    expect(buildMove(state, { kind: 'attack', actor: 'me', uid: opp.uid, targetUid: null }, cardOf)).toHaveProperty('error');
    expect(buildMove(state, { kind: 'attack', actor: 'me', uid: skull.uid, targetUid: set.uid }, cardOf)).toHaveProperty('error');
    expect(buildMove(state, { kind: 'take_control', actor: 'me', uid: skull.uid }, cardOf)).toHaveProperty('error');
  });
});

describe('moves', () => {
  const base: DuelMove = { id: 'a', actor: 'me', action: 'fusion_summon', cardId: THOUSAND, from: { side: 'me', zone: 'extra', index: 0 }, to: { side: 'me', zone: 'emz', index: 0 }, targets: [], auto: false, note: '' };

  it('treats Main and Extra Monster Zones alike and ignores zone numbers', () => {
    expect(movesMatch(base, { ...base, id: 'b', to: { side: 'me', zone: 'monster', index: 3 } })).toBe(true);
    expect(movesMatch(base, { ...base, to: { side: 'me', zone: 'gy' } })).toBe(false);
    expect(movesMatch(base, { ...base, actor: 'opp' })).toBe(false);
  });

  it('compares materials and treats destroy like send to GY', () => {
    const withMaterials = { ...base, targets: [{ cardId: CELTIC, from: { side: 'me' as Side, zone: 'hand' as const }, to: { side: 'me' as Side, zone: 'gy' as const } }] };
    expect(movesMatch(withMaterials, base)).toBe(false);
    const destroy: DuelMove = { ...base, action: 'destroy', cardId: SKULL, from: { side: 'opp', zone: 'monster', index: 1 }, to: { side: 'opp', zone: 'gy' } };
    expect(movesMatch(destroy, { ...destroy, action: 'send_gy' })).toBe(true);
  });

  it('only checks activation targets when both moves name some', () => {
    const activate: DuelMove = { ...base, action: 'activate', cardId: MST, from: { side: 'me', zone: 'hand' }, to: { side: 'me', zone: 'gy' }, targets: [{ cardId: SKULL, from: { side: 'opp', zone: 'spell', index: 0 }, to: null }] };
    expect(movesMatch(activate, { ...activate, targets: [] })).toBe(true);
    expect(movesMatch(activate, { ...activate, targets: [{ cardId: CELTIC, from: { side: 'opp', zone: 'spell', index: 1 }, to: null }] })).toBe(false);
  });

  it('describes moves in German', () => {
    const activate: DuelMove = { ...base, action: 'activate', cardId: POLY, from: { side: 'me', zone: 'hand' }, to: { side: 'me', zone: 'gy' } };
    expect(describeMove(activate, nameOf)).toBe('Aktivieren: Polymerization');
    const attack: DuelMove = { ...base, action: 'attack', cardId: BEWD, targets: [{ cardId: SKULL, from: { side: 'opp', zone: 'monster' }, to: { side: 'opp', zone: 'gy' } }], lp: { me: 0, opp: -500 } };
    expect(describeMove(attack, nameOf)).toBe('Angriff: Blue-Eyes White Dragon greift Summoned Skull an (Gegner -500 LP)');
    expect(describeMove({ ...attack, actor: 'opp', action: 'direct_attack', targets: [], lp: { me: -3000, opp: 0 } }, nameOf)).toBe('Gegner – Direkter Angriff: Blue-Eyes White Dragon (du -3000 LP)');
  });
});
