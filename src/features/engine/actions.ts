import { BattleAction, IdleAction, Loc, Msg, Res, splitDescription } from './ocg';
import type { CardLoc, EngineResponse, Player, Prompt, SelectBattleCmd, SelectIdleCmd } from './types';

export type EngineAction = { key: string; label: string; response: EngineResponse; kind: 'summon' | 'spsummon' | 'repos' | 'mset' | 'sset' | 'activate' | 'attack' };

/** German texts for EDOPro system strings used in prompts. */
export const SYSTEM_TEXT: Record<number, string> = {
  1: 'Normalbeschwörung',
  2: 'Spezialbeschwörung',
  3: 'Flippbeschwörung',
  7: 'Aktivieren',
  30: 'Wiederholung: Angriff fortsetzen?',
  31: 'Direkt angreifen?',
  90: 'Ohne Tribut beschwören?',
  91: 'Zusätzlich beschwören?',
  92: 'Effekt eines Monsters des Gegners als Material verwenden?',
  93: 'Weiter auswählen?',
  94: 'Diesen Effekt jetzt aktivieren?',
  95: 'Diesen Effekt aktivieren?',
  96: 'Effekt verwenden, um die Zerstörung zu verhindern?',
  97: 'In die Zauber- & Fallenzone legen?',
  98: 'Ein Monster tributieren?',
  500: 'Karte(n) zum Tributieren wählen',
  501: 'Karte(n) zum Abwerfen wählen',
  502: 'Karte(n) zum Zerstören wählen',
  503: 'Karte(n) zum Verbannen wählen',
  504: 'Karte(n) für den Friedhof wählen',
  505: 'Karte(n) zum Zurückgeben auf die Hand wählen',
  506: 'Karte(n) für die Hand wählen',
  507: 'Karte(n) zum Zurücklegen ins Deck wählen',
  508: 'Karte(n) zur Normalbeschwörung wählen',
  509: 'Karte(n) zur Spezialbeschwörung wählen',
  510: 'Karte(n) zum Setzen wählen',
  511: 'Fusionsmaterial wählen',
  512: 'Synchromaterial wählen',
  513: 'Xyz-Material wählen',
  514: 'Offene Karte(n) wählen',
  515: 'Verdeckte Karte(n) wählen',
  516: 'Monster in Angriffsposition wählen',
  517: 'Monster in Verteidigungsposition wählen',
  518: 'Karte(n) zum Ausrüsten wählen',
  519: 'Abzuhängendes Xyz-Material wählen',
  520: 'Monster für den Kontrollwechsel wählen',
  521: 'Ersatzkarte(n) wählen',
  526: 'Karte(n) zum Aufdecken wählen',
  527: 'Karte(n) für das Spielfeld wählen',
  528: 'Monster für den Positionswechsel wählen',
  529: 'Eigene Karte wählen',
  530: 'Karte des Gegners wählen',
  531: 'Monster für die Tributbeschwörung wählen',
  532: 'Monster wählen, von dem Material abgehängt wird',
  533: 'Linkmaterial wählen',
  534: 'Karte(n) wählen, die auf dem Feld bleiben',
  549: 'Angriffsziel wählen',
  550: 'Zu aktivierenden Effekt wählen',
  551: 'Ziel(e) des Effekts wählen',
  552: 'Kopf oder Zahl wählen',
  553: 'Würfelergebnis wählen',
  554: 'Kartenart ansagen',
  555: 'Option wählen',
  556: 'Anzuwendenden Effekt wählen',
  560: 'Auswählen',
  561: 'Kampfposition wählen',
  562: 'Eigenschaft ansagen',
  563: 'Typ ansagen',
  564: 'Kartennamen ansagen',
  565: 'Zahl ansagen',
  566: 'Zu aktivierenden Effekt wählen',
  567: 'Stufe/Rang ansagen',
  568: 'Aufzulösende Karte wählen',
  569: 'Zone wählen',
  570: 'Zone(n) wählen, die unbenutzbar werden',
  571: 'Zielzone wählen',
  572: 'Karte(n) für Zählmarken wählen',
  573: 'Karte(n) auf die Hand nehmen',
  574: 'Karte(n) auf den Friedhof legen',
  575: 'Karte(n) wählen, deren Effekte annulliert werden',
  576: 'Karte(n) wählen, deren ATK/DEF sich ändert',
  577: 'Karte(n) wählen, auf die angewendet wird',
  578: 'Karte(n) zum Anhängen wählen',
  579: 'Karte(n) zum Zurücklegen auf den Friedhof wählen',
  1150: 'Aktivieren',
  1151: 'Normalbeschwörung',
  1152: 'Spezialbeschwörung',
  1153: 'Setzen',
  1154: 'Flippbeschwörung',
  1155: 'In Verteidigungsposition',
  1156: 'In Angriffsposition',
  1157: 'Angreifen',
};

export type TextSources = { strings: Map<number, string[]>; system: Map<number, string> };

/**
 * Text of an effect description or hint: card strings are packed as
 * passcode × 16 + index, smaller values are EDOPro system strings.
 */
export function describe(description: number | null | undefined, sources: TextSources): string {
  if (!description) return '';
  if (description < 10000) return SYSTEM_TEXT[description] ?? sources.system.get(description) ?? '';
  const { code, index } = splitDescription(description);
  return sources.strings.get(code)?.[index] ?? '';
}

const same = (c: CardLoc, loc: { controller: Player; location: number; sequence: number }) =>
  c.controller === loc.controller && (c.location & ~Loc.OVERLAY) === loc.location && c.sequence === loc.sequence;

/** What the player may do with the card at this location right now (main/battle phase). */
export function cardActions(prompt: Prompt | null, loc: { controller: Player; location: number; sequence: number }, sources: TextSources): EngineAction[] {
  if (!prompt) return [];
  const r = prompt.request;
  const out: EngineAction[] = [];
  if (r.type === Msg.SELECT_IDLECMD) {
    const idle = r as SelectIdleCmd;
    const add = (list: CardLoc[], action: number, kind: EngineAction['kind'], label: (c: CardLoc) => string) =>
      list.forEach((c, index) => {
        if (same(c, loc)) out.push({ key: `${kind}-${index}`, label: label(c), kind, response: { type: Res.SELECT_IDLECMD, action, index } });
      });
    add(idle.summons, IdleAction.SUMMON, 'summon', () => 'Normalbeschwörung');
    add(idle.special_summons, IdleAction.SPECIAL_SUMMON, 'spsummon', () => 'Spezialbeschwörung');
    add(idle.monster_sets, IdleAction.MONSTER_SET, 'mset', () => 'Verdeckt setzen');
    add(idle.spell_sets, IdleAction.SPELL_SET, 'sset', () => 'Setzen');
    add(idle.pos_changes, IdleAction.POS_CHANGE, 'repos', () => 'Kampfposition ändern');
    add(idle.activates, IdleAction.ACTIVATE, 'activate', (c) => {
      const text = describe((c as CardLoc & { description?: number }).description, sources);
      return text ? `Aktivieren: ${text}` : 'Aktivieren';
    });
  } else if (r.type === Msg.SELECT_BATTLECMD) {
    const battle = r as SelectBattleCmd;
    battle.attacks.forEach((c, index) => {
      if (same(c, loc)) out.push({ key: `attack-${index}`, label: 'Angreifen', kind: 'attack', response: { type: Res.SELECT_BATTLECMD, action: BattleAction.ATTACK, index } });
    });
    battle.chains.forEach((c, index) => {
      if (!same(c, loc)) return;
      const text = describe(c.description, sources);
      out.push({ key: `activate-${index}`, label: text ? `Aktivieren: ${text}` : 'Aktivieren', kind: 'activate', response: { type: Res.SELECT_BATTLECMD, action: BattleAction.CHAIN, index } });
    });
  }
  return out;
}

/** Phase buttons offered by the current prompt. */
export function phaseActions(prompt: Prompt | null): { key: string; label: string; response: EngineResponse }[] {
  if (!prompt) return [];
  const r = prompt.request;
  if (r.type === Msg.SELECT_IDLECMD) {
    const out = [];
    if (r.to_bp) out.push({ key: 'to-bp', label: 'Kampfphase', response: { type: Res.SELECT_IDLECMD, action: IdleAction.TO_BP, index: null } as EngineResponse });
    if (r.to_ep) out.push({ key: 'to-ep', label: 'Zug beenden', response: { type: Res.SELECT_IDLECMD, action: IdleAction.TO_EP, index: null } as EngineResponse });
    return out;
  }
  if (r.type === Msg.SELECT_BATTLECMD) {
    const out = [];
    if (r.to_m2) out.push({ key: 'to-m2', label: 'Main Phase 2', response: { type: Res.SELECT_BATTLECMD, action: BattleAction.TO_M2, index: null } as EngineResponse });
    if (r.to_ep) out.push({ key: 'to-ep', label: 'Zug beenden', response: { type: Res.SELECT_BATTLECMD, action: BattleAction.TO_EP, index: null } as EngineResponse });
    return out;
  }
  return [];
}

/** Actions that fit a drop of the card at `from` onto the zone at `to`. */
export function dropActions(actions: EngineAction[], from: { controller: Player; location: number }, to: { controller: Player; location: number }): EngineAction[] {
  if (to.controller !== from.controller) return actions.filter((a) => a.kind === 'attack');
  if (to.location === Loc.MZONE) return actions.filter((a) => a.kind === 'summon' || a.kind === 'spsummon' || a.kind === 'mset' || (a.kind === 'activate' && from.location === Loc.HAND));
  if (to.location === Loc.SZONE) return actions.filter((a) => a.kind === 'sset' || a.kind === 'activate');
  if (to.location === Loc.GRAVE) return actions.filter((a) => a.kind === 'activate');
  return [];
}

export const PHASE_NAMES: Record<number, string> = {
  1: 'Draw Phase',
  2: 'Standby Phase',
  4: 'Main Phase 1',
  8: 'Battle Phase',
  16: 'Battle Phase',
  32: 'Damage Step',
  64: 'Damage Step',
  128: 'Battle Phase',
  256: 'Main Phase 2',
  512: 'End Phase',
};

export const LOCATION_NAMES: Record<number, string> = {
  [Loc.DECK]: 'Deck',
  [Loc.HAND]: 'Hand',
  [Loc.MZONE]: 'Monsterzone',
  [Loc.SZONE]: 'Zauber-/Fallenzone',
  [Loc.GRAVE]: 'Friedhof',
  [Loc.REMOVED]: 'Verbannt',
  [Loc.EXTRA]: 'Extra Deck',
  [Loc.OVERLAY]: 'Xyz-Material',
  [Loc.FZONE]: 'Spielfeldzone',
  [Loc.PZONE]: 'Pendelzone',
};
