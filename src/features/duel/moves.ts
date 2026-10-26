import type { DuelMove, Location, MoveAction, ZoneType } from './types';

export const MOVE_LABELS: Record<MoveAction, string> = {
  normal_summon: 'Normalbeschwörung',
  special_summon: 'Spezialbeschwörung',
  set: 'Setzen',
  flip: 'Flippbeschwörung',
  activate: 'Aktivieren',
  link_summon: 'Linkbeschwörung',
  xyz_summon: 'Xyz-Beschwörung',
  synchro_summon: 'Synchrobeschwörung',
  fusion_summon: 'Fusionsbeschwörung',
  ritual_summon: 'Ritualbeschwörung',
  attack: 'Angriff',
  direct_attack: 'Direkter Angriff',
  change_position: 'Kampfposition ändern',
  destroy: 'Zerstören',
  send_gy: 'Auf den Friedhof legen',
  discard: 'Abwerfen',
  banish: 'Verbannen',
  to_hand: 'Auf die Hand',
  to_deck: 'Ins Deck zurück',
  take_control: 'Kontrolle übernehmen',
  damage: 'Schaden zufügen',
};

export const ZONE_NAMES: Record<ZoneType, string> = {
  hand: 'Hand',
  monster: 'Monsterzone',
  emz: 'Extra-Monsterzone',
  spell: 'Zauber-/Fallenzone',
  field: 'Spielfeldzone',
  gy: 'Friedhof',
  banished: 'Verbannt',
  deck: 'Deck',
  extra: 'Extra Deck',
};

/** "Aktivieren: Raigeki", "Angriff: Blue-Eyes greift Celtic Guardian an (1600 Schaden)", … */
export function describeMove(move: DuelMove, nameOf: (id: number) => string): string {
  const who = move.actor === 'opp' ? 'Gegner – ' : '';
  const name = nameOf(move.cardId);
  const names = (ids: number[]) => ids.map(nameOf).join(', ');
  const damageText = () => {
    const parts: string[] = [];
    if (move.lp?.opp) parts.push(`Gegner ${move.lp.opp} LP`);
    if (move.lp?.me) parts.push(`du ${move.lp.me} LP`);
    return parts.length ? ` (${parts.join(', ')})` : '';
  };

  switch (move.action) {
    case 'attack':
      return `${who}Angriff: ${name} greift ${names(move.targets.map((t) => t.cardId))} an${damageText()}`;
    case 'direct_attack':
      return `${who}Direkter Angriff: ${name}${damageText()}`;
    case 'damage':
      return `${who}Schaden durch ${name}${damageText()}`;
    case 'link_summon':
    case 'xyz_summon':
    case 'synchro_summon':
    case 'fusion_summon':
    case 'ritual_summon':
      return `${who}${MOVE_LABELS[move.action]}: ${name}${move.targets.length ? ` (Materialien: ${names(move.targets.map((t) => t.cardId))})` : ''}`;
    case 'normal_summon':
    case 'set':
      return `${who}${MOVE_LABELS[move.action]}: ${name}${move.targets.length ? ` (Tribut: ${names(move.targets.map((t) => t.cardId))})` : ''}`;
    case 'activate':
      return `${who}Aktivieren: ${name}${move.targets.length ? ` → ${names(move.targets.map((t) => t.cardId))}` : ''}`;
    default:
      return `${who}${MOVE_LABELS[move.action]}: ${name}`;
  }
}

/** The Main and Extra Monster Zones count as the same place when comparing moves. */
function zoneKey(loc: Location | null): string {
  if (!loc) return '-';
  return `${loc.side}:${loc.zone === 'emz' ? 'monster' : loc.zone}`;
}

/** Destroying and sending to the GY end the same way in this model. */
function actionKey(action: MoveAction): string {
  return action === 'destroy' ? 'send_gy' : action;
}

/**
 * Whether the player's move is the one a solution expects. Zone numbers,
 * positions and LP are not compared; targets are compared by card. For
 * activations, targets only count when both moves name some (choosing a
 * target is optional for the player).
 */
export function movesMatch(expected: DuelMove, actual: DuelMove): boolean {
  if (expected.actor !== actual.actor || actionKey(expected.action) !== actionKey(actual.action) || expected.cardId !== actual.cardId) return false;
  if (zoneKey(expected.from) !== zoneKey(actual.from)) return false;
  if (zoneKey(expected.to) !== zoneKey(actual.to)) return false;
  if (expected.action === 'activate' && (expected.targets.length === 0 || actual.targets.length === 0)) return true;
  const key = (m: DuelMove) =>
    m.targets
      .map((t) => `${t.cardId}>${t.attach ? 'attach' : zoneKey(t.to)}`)
      .sort()
      .join(',');
  return key(expected) === key(actual);
}
