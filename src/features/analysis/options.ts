import { describe, LOCATION_NAMES, type TextSources } from '@/features/engine/actions';
import { BattleAction, IdleAction, Loc, Msg, Res } from '@/features/engine/ocg';
import type { CardLoc, EngineResponse, SelectRequest } from '@/features/engine/types';

export type DecisionOption = { label: string; response: EngineResponse };

type Names = { nameOf: (code: number) => string; sources: TextSources };

function effect(code: number, location: number, description: number | undefined, { nameOf, sources }: Names): string {
  const text = describe(description, sources);
  const from = location === Loc.HAND ? ' (Hand)' : location === Loc.GRAVE ? ' (Friedhof)' : location === Loc.REMOVED ? ' (verbannt)' : '';
  return `${nameOf(code)}${from}${text ? ` – ${text}` : ''}`;
}

/** Every option of a main/battle phase, chain or yes/no decision, as a German label with the matching response. */
export function decisionOptions(request: SelectRequest, names: Names): DecisionOption[] {
  const { nameOf, sources } = names;
  const out: DecisionOption[] = [];
  switch (request.type) {
    case Msg.SELECT_IDLECMD: {
      const add = (list: CardLoc[], action: number, label: (c: CardLoc) => string) =>
        list.forEach((c, index) => out.push({ label: label(c), response: { type: Res.SELECT_IDLECMD, action, index } }));
      add(request.summons, IdleAction.SUMMON, (c) => `Normalbeschwörung: ${nameOf(c.code)}`);
      add(request.special_summons, IdleAction.SPECIAL_SUMMON, (c) => `Spezialbeschwörung: ${nameOf(c.code)} (${LOCATION_NAMES[c.location] ?? ''})`);
      add(request.monster_sets, IdleAction.MONSTER_SET, (c) => `Verdeckt setzen: ${nameOf(c.code)}`);
      add(request.spell_sets, IdleAction.SPELL_SET, (c) => `Setzen: ${nameOf(c.code)}`);
      add(request.pos_changes, IdleAction.POS_CHANGE, (c) => `Kampfposition ändern: ${nameOf(c.code)}`);
      request.activates.forEach((c, index) =>
        out.push({ label: `Aktivieren: ${effect(c.code, c.location, c.description, names)}`, response: { type: Res.SELECT_IDLECMD, action: IdleAction.ACTIVATE, index } })
      );
      if (request.to_bp) out.push({ label: 'In die Battle Phase gehen', response: { type: Res.SELECT_IDLECMD, action: IdleAction.TO_BP, index: null } });
      if (request.to_ep) out.push({ label: 'Zug beenden', response: { type: Res.SELECT_IDLECMD, action: IdleAction.TO_EP, index: null } });
      break;
    }
    case Msg.SELECT_BATTLECMD:
      request.attacks.forEach((c, index) =>
        out.push({ label: `Angreifen mit ${nameOf(c.code)}`, response: { type: Res.SELECT_BATTLECMD, action: BattleAction.ATTACK, index } })
      );
      request.chains.forEach((c, index) =>
        out.push({ label: `Aktivieren: ${effect(c.code, c.location, c.description, names)}`, response: { type: Res.SELECT_BATTLECMD, action: BattleAction.CHAIN, index } })
      );
      if (request.to_m2) out.push({ label: 'In die Main Phase 2 gehen', response: { type: Res.SELECT_BATTLECMD, action: BattleAction.TO_M2, index: null } });
      if (request.to_ep) out.push({ label: 'Zug beenden', response: { type: Res.SELECT_BATTLECMD, action: BattleAction.TO_EP, index: null } });
      break;
    case Msg.SELECT_CHAIN:
      out.push({ label: 'Nicht reagieren (keine Kette)', response: { type: Res.SELECT_CHAIN, index: null } });
      request.selects.forEach((c, index) =>
        out.push({ label: `Als Kette aktivieren: ${effect(c.code, c.location, c.description, names)}`, response: { type: Res.SELECT_CHAIN, index } })
      );
      break;
    case Msg.SELECT_EFFECTYN: {
      const text = effect(request.code, request.location, request.description, names);
      out.push({ label: `Ja – ${text}`, response: { type: Res.SELECT_EFFECTYN, yes: true } });
      out.push({ label: 'Nein', response: { type: Res.SELECT_EFFECTYN, yes: false } });
      break;
    }
    case Msg.SELECT_YESNO: {
      const text = describe(request.description, sources);
      out.push({ label: text ? `Ja – ${text}` : 'Ja', response: { type: Res.SELECT_YESNO, yes: true } });
      out.push({ label: 'Nein', response: { type: Res.SELECT_YESNO, yes: false } });
      break;
    }
  }
  return out;
}

/** Same decision answer (responses are compared by their fields, not by object identity). */
export function sameResponse(a: EngineResponse, b: EngineResponse): boolean {
  const norm = (r: EngineResponse) => JSON.stringify(r, Object.keys(r).sort());
  return norm(a) === norm(b);
}
