import type { Card } from '@/features/cards/types';

import type { CardInstance, Location, MoveTarget, Side } from './types';

export type CardLookupFn = (cardId: number) => Card | undefined;

/** Current ATK/DEF: manual override, else the printed value. */
export function statsOf(card: CardInstance, cardOf: CardLookupFn): { atk: number; def: number } {
  const data = cardOf(card.cardId);
  return { atk: card.atk ?? data?.atk ?? 0, def: card.def ?? data?.def ?? 0 };
}

export type BattleResult = {
  targets: MoveTarget[];
  /** Where the attacker goes (its owner's GY when destroyed), or null. */
  attackerTo: Location | null;
  lp: { me: number; opp: number };
};

function damage(side: Side, amount: number): { me: number; opp: number } {
  return side === 'me' ? { me: -amount, opp: 0 } : { me: 0, opp: -amount };
}

/**
 * Battle damage and destruction by the printed rules for monsters without
 * effects: ATK vs ATK destroys the weaker monster (both on a tie) and deals
 * the difference; ATK vs DEF destroys the defender if ATK is higher, and the
 * attacker's controller takes damage if it is lower. A face-down defender is
 * flipped face-up. Direct attacks deal the attacker's ATK.
 */
export function resolveBattle(
  attacker: { loc: Location; card: CardInstance },
  target: { loc: Location; card: CardInstance } | null,
  cardOf: CardLookupFn
): BattleResult {
  const attackSide = attacker.loc.side;
  const defendSide: Side = attackSide === 'me' ? 'opp' : 'me';
  const atk = statsOf(attacker.card, cardOf).atk;

  if (!target) return { targets: [], attackerTo: null, lp: damage(defendSide, atk) };

  const defenderStats = statsOf(target.card, cardOf);
  const toGy = (owner: Side): Location => ({ side: owner, zone: 'gy' });
  const result: BattleResult = { targets: [], attackerTo: null, lp: { me: 0, opp: 0 } };
  const flip = target.card.faceUp ? undefined : true;

  if (target.card.defense) {
    if (atk > defenderStats.def) {
      result.targets.push({ cardId: target.card.cardId, from: target.loc, to: toGy(target.card.owner) });
    } else {
      result.targets.push({ cardId: target.card.cardId, from: target.loc, to: null, faceUp: flip });
      if (atk < defenderStats.def) result.lp = damage(attackSide, defenderStats.def - atk);
    }
    return result;
  }

  const defenderAtk = defenderStats.atk;
  if (atk > defenderAtk) {
    result.targets.push({ cardId: target.card.cardId, from: target.loc, to: toGy(target.card.owner) });
    result.lp = damage(defendSide, atk - defenderAtk);
  } else if (atk < defenderAtk) {
    result.targets.push({ cardId: target.card.cardId, from: target.loc, to: null });
    result.attackerTo = toGy(attacker.card.owner);
    result.lp = damage(attackSide, defenderAtk - atk);
  } else if (atk > 0) {
    result.targets.push({ cardId: target.card.cardId, from: target.loc, to: toGy(target.card.owner) });
    result.attackerTo = toGy(attacker.card.owner);
  } else {
    result.targets.push({ cardId: target.card.cardId, from: target.loc, to: null });
  }
  return result;
}
