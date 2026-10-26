import type { CardInstance, DuelState, Side } from '@/features/duel/types';

import { CardType } from '../ocg';

/** Summon types for monsters that must count as properly summoned (SUMMON_TYPE_* in constant.lua). */
const SUMMON_TYPES: [number, string][] = [
  [CardType.LINK, 'SUMMON_TYPE_LINK'],
  [CardType.XYZ, 'SUMMON_TYPE_XYZ'],
  [CardType.SYNCHRO, 'SUMMON_TYPE_SYNCHRO'],
  [CardType.FUSION, 'SUMMON_TYPE_FUSION'],
  [CardType.RITUAL, 'SUMMON_TYPE_RITUAL'],
];

const position = (card: CardInstance, monster: boolean) =>
  monster ? (card.faceUp ? (card.defense ? 'POS_FACEUP_DEFENSE' : 'POS_FACEUP_ATTACK') : 'POS_FACEDOWN_DEFENSE') : card.faceUp ? 'POS_FACEUP' : 'POS_FACEDOWN';

/**
 * Turns a puzzle position into an EDOPro puzzle script: you are player 0 and
 * start in your Main Phase 1 (attacks allowed); at the end of the turn you
 * lose (aux.BeginPuzzle), so the opponent's LP must reach 0 this turn.
 */
export function puzzleScript(state: DuelState, cardType: (code: number) => number): string {
  const lines = ['-- generated puzzle', 'Debug.ReloadFieldBegin(DUEL_ATTACK_FIRST_TURN+DUEL_SIMPLE_AI,5)', 'local c={}'];
  const player = (side: Side) => (side === 'me' ? 0 : 1);
  lines.push(`Debug.SetPlayerInfo(0,${state.me.lp},0,0)`, `Debug.SetPlayerInfo(1,${state.opp.lp},0,0)`);
  let n = 0;
  const overlays: string[] = [];
  const add = (card: CardInstance, controller: Side, location: string, sequence: number, pos: string) => {
    // A table instead of locals: Lua allows at most 200 locals per function.
    const name = `c[${++n}]`;
    lines.push(`${name}=Debug.AddCard(${card.cardId},${player(card.owner)},${player(controller)},${location},${sequence},${pos})`);
    return name;
  };
  const monster = (card: CardInstance, controller: Side, sequence: number) => {
    const name = add(card, controller, 'LOCATION_MZONE', sequence, position(card, true));
    const type = cardType(card.cardId);
    const summon = SUMMON_TYPES.find(([flag]) => type & flag);
    if (summon) lines.push(`Debug.PreSummon(${name},${summon[1]})`);
    // Materials cannot be attached while the field is built: they start in the
    // GY and are attached by a one-time effect before the first decision.
    const materials = card.materials.map((m) => add(m, m.owner, 'LOCATION_GRAVE', 0, 'POS_FACEUP'));
    if (materials.length) overlays.push(`Duel.Overlay(${name},Group.FromCards(${materials.join(',')}))`);
  };

  for (const side of ['me', 'opp'] as Side[]) {
    const s = state[side];
    s.hand.forEach((card) => add(card, side, 'LOCATION_HAND', 0, 'POS_FACEDOWN'));
    s.deck.forEach((card) => add(card, side, 'LOCATION_DECK', 0, 'POS_FACEDOWN'));
    s.extra.forEach((card) => add(card, side, 'LOCATION_EXTRA', 0, 'POS_FACEDOWN'));
    s.gy.forEach((card) => add(card, side, 'LOCATION_GRAVE', 0, 'POS_FACEUP'));
    s.banished.forEach((card) => add(card, side, 'LOCATION_REMOVED', 0, 'POS_FACEUP'));
    s.monster.forEach((card, i) => card && monster(card, side, i));
    s.spell.forEach((card, i) => card && add(card, side, 'LOCATION_SZONE', i, position(card, false)));
    s.field.forEach((card) => card && add(card, side, 'LOCATION_SZONE', 5, position(card, false)));
  }
  // Extra Monster Zones: index 0 is the left one from your side, which is the opponent's zone 6.
  state.emz.forEach((card, i) => {
    if (!card) return;
    const mine = card.owner === 'me';
    monster(card, card.owner, mine ? 5 + i : 6 - i);
  });

  lines.push('Debug.ReloadFieldEnd()');
  if (overlays.length) {
    lines.push(
      'local attach=Effect.GlobalEffect()',
      'attach:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)',
      'attach:SetCode(EVENT_ADJUST)',
      'local attached=false',
      `attach:SetOperation(function(e) if attached then return end attached=true e:Reset() ${overlays.join(' ')} end)`,
      'Duel.RegisterEffect(attach,0)'
    );
  }
  lines.push('aux.BeginPuzzle()');
  return lines.join('\n') + '\n';
}
