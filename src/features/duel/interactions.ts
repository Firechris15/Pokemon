import type { Card } from '@/features/cards/types';

import type { CardLookupFn } from './battle';
import { extraSummonAction, type ExtraSummonAction, type Intent } from './builder';
import { fieldCards, isSlotZone, locate, monstersOf, other, zoneArray } from './state';
import type { CardInstance, DuelState, Location, Side } from './types';

/** Cards the player has to choose before the move can be built. */
export type Selection = {
  title: string;
  field: 'tributes' | 'materials' | 'targets' | 'targetUid';
  candidates: string[];
  min: number;
  max: number;
};

export type ActionOption = {
  key: string;
  label: string;
  intent: Intent;
  select?: Selection;
};

export type InteractionContext = {
  state: DuelState;
  cardOf: CardLookupFn;
  /** Fixed actor (solving: always the player); null = the card's controller acts (editor). */
  actor: Side | null;
};

const SUMMON_LABELS: Record<ExtraSummonAction, string> = {
  link_summon: 'Linkbeschwörung',
  xyz_summon: 'Xyz-Beschwörung',
  synchro_summon: 'Synchrobeschwörung',
  fusion_summon: 'Fusionsbeschwörung',
  ritual_summon: 'Ritualbeschwörung',
};

const isMonster = (card: Card | undefined) => !card || card.cardClass === 'monster' || card.cardClass === 'token';

/** Level 5–6 monsters need 1 tribute, level 7+ need 2. */
export function tributeCount(card: Card | undefined): number {
  if (!card || card.cardClass !== 'monster' || card.isExtraDeck) return 0;
  const level = card.level ?? 0;
  return level >= 7 ? 2 : level >= 5 ? 1 : 0;
}

/** Whether the card text talks about targeting ("Target 1 …"). */
export function mentionsTarget(card: Card | undefined): boolean {
  return Boolean(card && /\btarget/i.test(card.descEn));
}

function uids(list: { card: CardInstance }[]): string[] {
  return list.map((f) => f.card.uid);
}

function pileUids(state: DuelState, zones: ('gy' | 'banished')[]): string[] {
  return (['me', 'opp'] as Side[]).flatMap((side) => zones.flatMap((zone) => state[side][zone].map((c) => c.uid)));
}

function targetSelection(state: DuelState, self: string): Selection {
  return {
    title: 'Ziele wählen (optional)',
    field: 'targets',
    candidates: [...uids(fieldCards(state)), ...pileUids(state, ['gy', 'banished'])].filter((u) => u !== self),
    min: 0,
    max: 5,
  };
}

function materialSelection(state: DuelState, actor: Side, self: string, action: ExtraSummonAction): Selection {
  const fromHand = action === 'fusion_summon' || action === 'ritual_summon';
  const hand = fromHand ? state[actor].hand.map((c) => c.uid) : [];
  return {
    title: action === 'ritual_summon' ? 'Tribute wählen' : 'Materialien wählen',
    field: 'materials',
    candidates: [...uids(monstersOf(state, actor)), ...hand].filter((u) => u !== self),
    min: 1,
    max: 6,
  };
}

function summonOptions(ctx: InteractionContext, card: CardInstance, loc: Location, actor: Side, to?: Location): ActionOption[] {
  const data = ctx.cardOf(card.cardId);
  const options: ActionOption[] = [];
  const base = { actor, uid: card.uid, to };
  if (loc.zone === 'hand' && loc.side === actor) {
    const tributes = tributeCount(data);
    const select: Selection | undefined =
      tributes > 0 ? { title: `${tributes} Tribut${tributes > 1 ? 'e' : ''} wählen`, field: 'tributes', candidates: uids(monstersOf(ctx.state, actor)), min: tributes, max: tributes } : undefined;
    options.push({ key: 'normal_summon', label: tributes ? 'Tributbeschwörung' : 'Normalbeschwörung', intent: { kind: 'normal_summon', ...base }, select });
    options.push({ key: 'set', label: 'Verdeckt setzen', intent: { kind: 'set', ...base }, select });
  }
  const summon = extraSummonAction(data);
  if (summon && (loc.zone === 'extra' || (summon === 'ritual_summon' && loc.zone === 'hand'))) {
    options.push({
      key: summon,
      label: SUMMON_LABELS[summon],
      intent: { kind: 'extra_summon', ...base, action: summon, materials: [] },
      select: materialSelection(ctx.state, actor, card.uid, summon),
    });
  }
  options.push({ key: 'ss_atk', label: 'Spezialbeschwörung (Angriff)', intent: { kind: 'special_summon', ...base, defense: false } });
  options.push({ key: 'ss_def', label: 'Spezialbeschwörung (Verteidigung)', intent: { kind: 'special_summon', ...base, defense: true } });
  return options;
}

function attackOptions(ctx: InteractionContext, card: CardInstance, actor: Side): ActionOption[] {
  if (!card.faceUp || card.defense) return [];
  const defenders = uids(monstersOf(ctx.state, other(actor)));
  const options: ActionOption[] = [];
  if (defenders.length > 0) {
    options.push({
      key: 'attack',
      label: 'Angreifen …',
      intent: { kind: 'attack', actor, uid: card.uid, targetUid: null },
      select: { title: 'Angriffsziel wählen', field: 'targetUid', candidates: defenders, min: 1, max: 1 },
    });
  }
  options.push({ key: 'direct_attack', label: 'Direkter Angriff', intent: { kind: 'attack', actor, uid: card.uid, targetUid: null } });
  return options;
}

function activateOption(ctx: InteractionContext, card: CardInstance, actor: Side, label: string, to?: Location): ActionOption {
  const data = ctx.cardOf(card.cardId);
  return {
    key: 'activate',
    label,
    intent: { kind: 'activate', actor, uid: card.uid, to, targets: [] },
    select: mentionsTarget(data) ? targetSelection(ctx.state, card.uid) : undefined,
  };
}

function simple(kind: 'destroy' | 'send_gy' | 'discard' | 'banish' | 'to_hand' | 'to_deck' | 'flip' | 'change_position' | 'take_control', label: string, actor: Side, uid: string, to?: Location): ActionOption {
  return { key: kind, label, intent: { kind, actor, uid, to } };
}

/** What can happen when a card is dropped on a zone. */
export function dropOptions(ctx: InteractionContext, uid: string, target: Location): ActionOption[] {
  const found = locate(ctx.state, uid);
  if (!found) return [];
  const { loc, card } = found;
  const data = ctx.cardOf(card.cardId);
  const own = ctx.actor ?? loc.side;
  const onField = isSlotZone(loc.zone);
  const monsterZone = (zone: Location['zone']) => zone === 'monster' || zone === 'emz';

  switch (target.zone) {
    case 'monster':
    case 'emz': {
      if (onField) {
        if (!monsterZone(loc.zone) || target.side === loc.side) return [];
        const occupant = zoneArray(ctx.state, target)[target.index ?? -1];
        if (occupant && (target.zone !== 'emz' || occupant.owner === target.side)) {
          if (!card.faceUp || card.defense) return [];
          return [{ key: 'attack', label: 'Angreifen', intent: { kind: 'attack', actor: ctx.actor ?? loc.side, uid, targetUid: occupant.uid } }];
        }
        return [simple('take_control', 'Kontrolle übernehmen', ctx.actor ?? target.side, uid, target)];
      }
      if (!isMonster(data)) return [];
      const actor = ctx.actor ?? (loc.zone === 'hand' || loc.zone === 'extra' ? loc.side : target.side);
      return summonOptions(ctx, card, loc, actor, target);
    }
    case 'spell':
    case 'field': {
      if (loc.zone !== 'hand') return [];
      const options: ActionOption[] = [];
      if (data?.cardClass === 'spell') options.push(activateOption(ctx, card, own, 'Aktivieren', target));
      if (data?.cardClass === 'spell' || data?.cardClass === 'trap') options.push({ key: 'set', label: 'Setzen', intent: { kind: 'set', actor: own, uid, to: target } });
      if (data?.frameType.endsWith('pendulum') && target.zone === 'spell') options.push(activateOption(ctx, card, own, 'Als Pendelbereich aktivieren', target));
      return options;
    }
    case 'gy': {
      if (loc.zone === 'gy') return [];
      if (loc.zone === 'hand') {
        const options = [simple('discard', 'Abwerfen', own, uid)];
        if (data?.cardClass !== 'trap') options.unshift(activateOption(ctx, card, own, isMonster(data) ? 'Effekt aktivieren (abwerfen)' : 'Aktivieren'));
        return options;
      }
      if (onField) {
        const options = [simple('destroy', 'Zerstören', own, uid), simple('send_gy', 'Auf den Friedhof legen', own, uid)];
        if (!isMonster(data) && loc.side === own) options.unshift(activateOption(ctx, card, own, 'Aktivieren'));
        return options;
      }
      return [simple('send_gy', 'Auf den Friedhof legen', own, uid)];
    }
    case 'banished':
      return loc.zone === 'banished' ? [] : [simple('banish', 'Verbannen', own, uid)];
    case 'hand': {
      if (loc.zone === 'hand') return [];
      const toHand = simple('to_hand', 'Auf die Hand', own, uid);
      // Dropping an attacker on the opponent's side of the table = direct attack.
      if (monsterZone(loc.zone) && target.side !== loc.side && card.faceUp && !card.defense) {
        return [{ key: 'direct_attack', label: 'Direkter Angriff', intent: { kind: 'attack', actor: ctx.actor ?? loc.side, uid, targetUid: null } }, toHand];
      }
      return [toHand];
    }
    case 'deck':
    case 'extra':
      return loc.zone === 'deck' || loc.zone === 'extra' ? [] : [simple('to_deck', 'Ins Deck zurück', own, uid)];
  }
}

/** The action menu when a card is tapped. */
export function cardOptions(ctx: InteractionContext, uid: string): ActionOption[] {
  const found = locate(ctx.state, uid);
  if (!found) return [];
  const { loc, card } = found;
  const data = ctx.cardOf(card.cardId);
  const own = ctx.actor ?? loc.side;
  const mine = loc.side === own;
  const monster = isMonster(data);

  switch (loc.zone) {
    case 'hand': {
      if (!mine) return [simple('discard', 'Abwerfen', own, uid), simple('to_deck', 'Ins Deck zurück', own, uid)];
      const options: ActionOption[] = [];
      if (monster) {
        options.push(...summonOptions(ctx, card, loc, own));
        options.push(activateOption(ctx, card, own, 'Effekt aktivieren (abwerfen)'));
      } else {
        if (data?.cardClass === 'spell') options.push(activateOption(ctx, card, own, 'Aktivieren'));
        options.push({ key: 'set', label: 'Setzen', intent: { kind: 'set', actor: own, uid } });
      }
      options.push(simple('discard', 'Abwerfen', own, uid), simple('banish', 'Verbannen', own, uid), simple('to_deck', 'Ins Deck zurück', own, uid));
      return options;
    }
    case 'monster':
    case 'emz': {
      const options: ActionOption[] = [];
      if (mine) {
        options.push(...attackOptions(ctx, card, own));
        options.push(activateOption(ctx, card, own, 'Effekt aktivieren'));
        if (!card.faceUp) options.push(simple('flip', 'Flippbeschwörung', own, uid));
        options.push(simple('change_position', card.defense ? 'In Angriffsposition' : 'In Verteidigungsposition', own, uid));
      } else {
        options.push(simple('take_control', 'Kontrolle übernehmen', own, uid));
      }
      options.push(simple('destroy', 'Zerstören', own, uid), simple('banish', 'Verbannen', own, uid), simple('to_hand', 'Auf die Hand', own, uid), simple('to_deck', 'Ins Deck zurück', own, uid));
      return options;
    }
    case 'spell':
    case 'field': {
      const options: ActionOption[] = [];
      if (mine && (!card.faceUp || !monster)) options.push(activateOption(ctx, card, own, card.faceUp ? 'Effekt aktivieren' : 'Aktivieren'));
      options.push(simple('destroy', 'Zerstören', own, uid), simple('banish', 'Verbannen', own, uid), simple('to_hand', 'Auf die Hand', own, uid));
      return options;
    }
    case 'gy':
    case 'banished':
    case 'deck':
    case 'extra': {
      const options: ActionOption[] = [];
      if (monster) options.push(...summonOptions(ctx, card, loc, own));
      if (loc.zone === 'gy' || loc.zone === 'banished') options.push(activateOption(ctx, card, own, 'Effekt aktivieren'));
      if (loc.zone !== 'gy') options.push(simple('send_gy', 'Auf den Friedhof legen', own, uid));
      if (loc.zone !== 'banished') options.push(simple('banish', 'Verbannen', own, uid));
      options.push(simple('to_hand', 'Auf die Hand', own, uid));
      if (loc.zone === 'gy' || loc.zone === 'banished') options.push(simple('to_deck', 'Ins Deck zurück', own, uid));
      return options;
    }
  }
}

/** Fills the chosen cards into the intent. */
export function applySelection(intent: Intent, field: Selection['field'], chosen: string[]): Intent {
  switch (field) {
    case 'targetUid':
      return intent.kind === 'attack' ? { ...intent, targetUid: chosen[0] ?? null } : intent;
    case 'materials':
      return intent.kind === 'extra_summon' ? { ...intent, materials: chosen } : intent;
    case 'tributes':
      return intent.kind === 'normal_summon' || intent.kind === 'set' ? { ...intent, tributes: chosen } : intent;
    case 'targets':
      return intent.kind === 'activate' ? { ...intent, targets: chosen } : intent;
  }
}
