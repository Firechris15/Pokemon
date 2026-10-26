import type { Card } from '@/features/cards/types';
import { createId } from '@/lib/id';

import { resolveBattle, type CardLookupFn } from './battle';
import { freeSlot, isSlotZone, locate } from './state';
import type { CardInstance, DuelMove, DuelState, Location, MoveAction, MoveTarget, Side } from './types';

export type ExtraSummonAction = 'link_summon' | 'xyz_summon' | 'synchro_summon' | 'fusion_summon' | 'ritual_summon';

/**
 * What the player wants to do, expressed with card instance ids (uids).
 * buildMove() turns it into a recorded DuelMove with concrete locations.
 */
export type Intent =
  | {
      kind:
        | 'normal_summon'
        | 'set'
        | 'special_summon'
        | 'flip'
        | 'change_position'
        | 'destroy'
        | 'send_gy'
        | 'discard'
        | 'banish'
        | 'to_hand'
        | 'to_deck'
        | 'take_control';
      actor: Side;
      uid: string;
      to?: Location;
      defense?: boolean;
      /** Tributes for a Tribute Summon. */
      tributes?: string[];
    }
  | { kind: 'activate'; actor: Side; uid: string; to?: Location; targets?: string[] }
  | { kind: 'extra_summon'; actor: Side; uid: string; action: ExtraSummonAction; materials: string[]; to?: Location }
  | { kind: 'attack'; actor: Side; uid: string; targetUid: string | null }
  | { kind: 'damage'; actor: Side; uid: string; side: Side; amount: number };

export type BuildResult = DuelMove | { error: string };

export function isError(result: BuildResult): result is { error: string } {
  return 'error' in result;
}

/** Normal/Quick-Play/Ritual spells and Normal/Counter traps go to the GY after resolving. */
export function resolvesToGy(card: Pick<Card, 'cardClass' | 'race'> | undefined): boolean {
  if (!card) return false;
  if (card.cardClass === 'spell') return !['Continuous', 'Field', 'Equip'].includes(card.race ?? '');
  if (card.cardClass === 'trap') return card.race !== 'Continuous';
  return false;
}

/** Which summon an Extra Deck / Ritual monster uses. */
export function extraSummonAction(card: Card | undefined): ExtraSummonAction | null {
  if (!card) return null;
  const frame = card.frameType;
  if (frame.startsWith('link')) return 'link_summon';
  if (frame.startsWith('xyz')) return 'xyz_summon';
  if (frame.startsWith('synchro')) return 'synchro_summon';
  if (frame.startsWith('fusion')) return 'fusion_summon';
  if (frame.startsWith('ritual')) return 'ritual_summon';
  return null;
}

function slotFor(state: DuelState, side: Side, preferred: Location | undefined, zones: ('monster' | 'emz' | 'spell' | 'field')[]): Location | null {
  if (preferred && isSlotZone(preferred.zone) && zones.includes(preferred.zone as never)) {
    const arr = preferred.zone === 'emz' ? state.emz : state[side][preferred.zone];
    if (preferred.index !== undefined && arr[preferred.index] === null) return { side, zone: preferred.zone, index: preferred.index };
  }
  for (const zone of zones) {
    const index = freeSlot(state, { side, zone });
    if (index >= 0) return { side, zone, index };
  }
  return null;
}

function owner(card: CardInstance, zone: 'gy' | 'banished' | 'hand' | 'deck' | 'extra'): Location {
  return { side: card.owner, zone };
}

export function buildMove(state: DuelState, intent: Intent, cardOf: CardLookupFn): BuildResult {
  const found = locate(state, intent.uid);
  if (!found) return { error: 'Karte nicht gefunden.' };
  const { loc, card } = found;
  const data = cardOf(card.cardId);
  const isMonster = data ? data.cardClass === 'monster' : true;
  const onField = isSlotZone(loc.zone);
  const ownCard = loc.side === intent.actor;

  const base = (action: MoveAction, to: Location | null, extra: Partial<DuelMove> = {}): DuelMove => ({
    id: createId(),
    actor: intent.actor,
    action,
    cardId: card.cardId,
    from: loc,
    to,
    targets: [],
    auto: false,
    note: '',
    ...extra,
  });
  const targetsFrom = (uids: string[] | undefined, to: (c: CardInstance) => Location | null, attach = false): MoveTarget[] | { error: string } => {
    const list: MoveTarget[] = [];
    for (const uid of uids ?? []) {
      const t = locate(state, uid);
      if (!t) return { error: 'Ziel nicht gefunden.' };
      list.push({ cardId: t.card.cardId, from: t.loc, to: attach ? null : to(t.card), ...(attach ? { attach: true } : {}) });
    }
    return list;
  };
  const notOwn = ownCard ? null : { error: 'Diese Karte kontrolliert der andere Spieler.' };

  switch (intent.kind) {
    case 'normal_summon': {
      if (notOwn) return notOwn;
      if (loc.zone !== 'hand') return { error: 'Nur Karten aus der Hand können als Normalbeschwörung beschworen werden.' };
      if (!isMonster) return { error: 'Nur Monster können beschworen werden.' };
      const tributes = targetsFrom(intent.tributes, (c) => owner(c, 'gy'));
      if ('error' in tributes) return tributes;
      const to = slotFor(state, intent.actor, intent.to, ['monster']);
      if (!to) return { error: 'Keine freie Monsterzone.' };
      return base('normal_summon', to, { faceUp: true, defense: false, targets: tributes });
    }
    case 'set': {
      if (notOwn) return notOwn;
      if (loc.zone !== 'hand') return { error: 'Nur Karten aus der Hand können gesetzt werden.' };
      if (isMonster) {
        const tributes = targetsFrom(intent.tributes, (c) => owner(c, 'gy'));
        if ('error' in tributes) return tributes;
        const to = slotFor(state, intent.actor, intent.to, ['monster']);
        if (!to) return { error: 'Keine freie Monsterzone.' };
        return base('set', to, { faceUp: false, defense: true, targets: tributes });
      }
      const zones: ('spell' | 'field')[] = data?.race === 'Field' ? ['field'] : ['spell'];
      const to = slotFor(state, intent.actor, intent.to, zones);
      if (!to) return { error: 'Keine freie Zauber-/Fallenzone.' };
      return base('set', to, { faceUp: false, defense: false });
    }
    case 'special_summon': {
      if (onField) return { error: 'Die Karte ist schon auf dem Feld.' };
      const zones: ('monster' | 'emz')[] = loc.zone === 'extra' ? ['emz', 'monster'] : ['monster'];
      const to = slotFor(state, intent.actor, intent.to, intent.to?.zone === 'monster' ? ['monster'] : zones);
      if (!to) return { error: 'Keine freie Monsterzone.' };
      return base('special_summon', to, { faceUp: true, defense: intent.defense ?? false });
    }
    case 'flip': {
      if (!onField || card.faceUp) return { error: 'Nur verdeckte Karten auf dem Feld können umgedreht werden.' };
      return base('flip', null, { faceUp: true, defense: false });
    }
    case 'change_position': {
      if (!onField || !isMonster) return { error: 'Nur Monster auf dem Feld können die Position wechseln.' };
      return base('change_position', null, { faceUp: true, defense: !card.defense });
    }
    case 'activate': {
      if (notOwn) return notOwn;
      const targets = targetsFrom(intent.targets, () => null);
      if ('error' in targets) return targets;
      const gy = owner(card, 'gy');
      if (loc.zone === 'hand') {
        if (!isMonster) {
          if (resolvesToGy(data)) return base('activate', gy, { faceUp: true, targets });
          const to = slotFor(state, intent.actor, intent.to, data?.race === 'Field' ? ['field'] : ['spell']);
          if (!to) return { error: 'Keine freie Zauber-/Fallenzone.' };
          return base('activate', to, { faceUp: true, targets });
        }
        // Hand traps: discarded as cost (pendulum scales can be placed via `to`).
        if (intent.to && isSlotZone(intent.to.zone)) {
          const to = slotFor(state, intent.actor, intent.to, ['spell']);
          if (to) return base('activate', to, { faceUp: true, targets });
        }
        return base('activate', gy, { faceUp: true, targets });
      }
      if (onField && !isMonster && resolvesToGy(data)) return base('activate', gy, { faceUp: true, targets });
      return base('activate', null, onField ? { faceUp: true, targets } : { targets });
    }
    case 'extra_summon': {
      if (onField) return { error: 'Die Karte ist schon auf dem Feld.' };
      const attach = intent.action === 'xyz_summon';
      const materials = targetsFrom(intent.materials, (c) => owner(c, 'gy'), attach);
      if ('error' in materials) return materials;
      const zones: ('monster' | 'emz')[] = loc.zone === 'extra' ? ['emz', 'monster'] : ['monster'];
      // The materials leave the field first, so their zones may be reused.
      let to = slotFor(state, intent.actor, intent.to, intent.to?.zone === 'monster' ? ['monster'] : zones);
      if (!to) {
        const freed = materials.find((m) => m.from.side === intent.actor && (m.from.zone === 'monster' || m.from.zone === 'emz'));
        if (freed) to = { side: intent.actor, zone: freed.from.zone, index: freed.from.index };
      }
      if (!to) return { error: 'Keine freie Monsterzone.' };
      return base(intent.action, to, { faceUp: true, defense: false, targets: materials });
    }
    case 'attack': {
      if (notOwn) return notOwn;
      if (!onField || !isMonster || !card.faceUp || card.defense) return { error: 'Nur offene Monster in Angriffsposition können angreifen.' };
      const target = intent.targetUid ? locate(state, intent.targetUid) : null;
      if (intent.targetUid && (!target || target.loc.side === intent.actor || !isSlotZone(target.loc.zone))) {
        return { error: 'Ungültiges Angriffsziel.' };
      }
      const battle = resolveBattle(found, target, cardOf);
      return base(target ? 'attack' : 'direct_attack', battle.attackerTo, { targets: battle.targets, lp: battle.lp });
    }
    case 'take_control': {
      if (ownCard || (loc.zone !== 'monster' && loc.zone !== 'emz')) return { error: 'Nur Monster des Gegners können übernommen werden.' };
      const to = slotFor(state, intent.actor, intent.to, ['monster']);
      if (!to) return { error: 'Keine freie Monsterzone.' };
      return base('take_control', to);
    }
    case 'damage': {
      const amount = Math.abs(Math.round(intent.amount));
      return base('damage', null, { lp: intent.side === 'me' ? { me: -amount, opp: 0 } : { me: 0, opp: -amount } });
    }
    case 'destroy':
    case 'send_gy':
      return base(intent.kind, owner(card, 'gy'));
    case 'discard':
      if (loc.zone !== 'hand') return { error: 'Nur Handkarten können abgeworfen werden.' };
      return base('discard', owner(card, 'gy'));
    case 'banish':
      return base('banish', owner(card, 'banished'));
    case 'to_hand':
      return base('to_hand', owner(card, 'hand'));
    case 'to_deck':
      return base('to_deck', owner(card, data?.isExtraDeck ? 'extra' : 'deck'));
  }
}
