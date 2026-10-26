import { chooseOption, showToast, type ChoiceOption } from '@/components/ui/dialogs';
import { afterModal } from '@/components/duel/useDuelActions';
import { ATTRIBUTE_LABELS, RACE_LABELS } from '@/features/cards/labels';
import { pickCards } from '@/features/cards/pickerStore';
import { describe, LOCATION_NAMES, SYSTEM_TEXT, type TextSources } from '@/features/engine/actions';
import { Loc, Msg, Pos, Res } from '@/features/engine/ocg';
import { selectInstances, showPile, type SheetItem } from '@/features/duel/sheetStore';
import type { CardLocPos, EngineResponse, Player, Prompt, SelectRequest } from '@/features/engine/types';

export type PromptContext = {
  viewer: Player;
  sources: TextSources;
  nameOf: (code: number) => string;
  /** Zone the player just dropped a card on (answers SELECT_PLACE). */
  takePlace: () => { controller: Player; location: number; sequence: number } | null;
  /** Monster the player just dropped an attacker on (answers the attack target choice). */
  takeAttackTarget: () => { controller: Player; location: number; sequence: number } | null;
  /** Ask at every chance to chain, not only when an effect responds to an event. */
  alwaysChain: boolean;
};

const POSITION_LABELS: [number, string][] = [
  [Pos.FACEUP_ATTACK, 'Offene Angriffsposition'],
  [Pos.FACEDOWN_ATTACK, 'Verdeckte Angriffsposition'],
  [Pos.FACEUP_DEFENSE, 'Offene Verteidigungsposition'],
  [Pos.FACEDOWN_DEFENSE, 'Verdeckte Verteidigungsposition'],
];

const ATTRIBUTE_BITS = ['EARTH', 'WATER', 'FIRE', 'WIND', 'LIGHT', 'DARK', 'DIVINE'];
const RACE_BITS = [
  'Warrior',
  'Spellcaster',
  'Fairy',
  'Fiend',
  'Zombie',
  'Machine',
  'Aqua',
  'Pyro',
  'Rock',
  'Winged Beast',
  'Plant',
  'Insect',
  'Thunder',
  'Dragon',
  'Beast',
  'Beast-Warrior',
  'Dinosaur',
  'Fish',
  'Sea Serpent',
  'Reptile',
  'Psychic',
  'Divine-Beast',
  'Creator God',
  'Wyrm',
  'Cyberse',
  'Illusion',
];

function isHidden(c: { controller: Player; location: number; position?: number }, viewer: Player): boolean {
  if (c.controller === viewer) return false;
  if (c.location === Loc.HAND || c.location === Loc.DECK || c.location === Loc.EXTRA) return true;
  return (c.location & (Loc.MZONE | Loc.SZONE)) !== 0 && c.position !== undefined && (c.position & Pos.FACEDOWN) !== 0;
}

function items(list: (CardLocPos | (Omit<CardLocPos, 'position'> & { position?: number }))[], ctx: PromptContext, prefix = ''): SheetItem[] {
  return list.map((c, i) => ({
    uid: `${prefix}${i}`,
    cardId: isHidden(c, ctx.viewer) ? 0 : c.code,
    faceDown: isHidden(c, ctx.viewer),
    caption: `${LOCATION_NAMES[c.location & ~Loc.OVERLAY] ?? ''}${c.controller === ctx.viewer ? '' : ' (Gegner)'}`,
  }));
}

function zoneLabel(bit: number, ctx: PromptContext, player: Player): { label: string; place: { player: Player; location: number; sequence: number } } {
  const own = bit < 16;
  const offset = bit % 16;
  const monster = offset < 8;
  const seq = offset % 8;
  const owner = (own ? player : 1 - player) as Player;
  const name = monster ? (seq >= 5 ? 'Extra-Monsterzone' : `Monsterzone ${seq + 1}`) : seq === 5 ? 'Spielfeldzone' : seq >= 6 ? 'Pendelzone' : `Zauber-/Fallenzone ${seq + 1}`;
  return { label: `${owner === ctx.viewer ? 'Deine' : 'Gegnerische'} ${name}`, place: { player: owner, location: monster ? Loc.MZONE : Loc.SZONE, sequence: seq } };
}

async function yesNo(title: string, message: string): Promise<boolean> {
  const answer = await chooseOption<boolean>({
    title,
    message: message || undefined,
    options: [
      { label: 'Ja', value: true, testID: 'prompt-yes' },
      { label: 'Nein', value: false, testID: 'prompt-no' },
    ],
  });
  return answer === true;
}

/** Repeats a dialog the player must not skip. */
async function required<T>(ask: () => Promise<T | null>): Promise<T> {
  for (;;) {
    const answer = await ask();
    if (answer !== null) return answer;
    showToast('Diese Entscheidung ist Pflicht.');
    await afterModal();
  }
}

const title = (prompt: Prompt, fallback: string, ctx: PromptContext) => (prompt.hint ? describe(prompt.hint, ctx.sources) || SYSTEM_TEXT[prompt.hint] : '') || fallback;

/**
 * Asks the player for every engine decision that is not made on the board
 * (choosing cards, chain responses, yes/no …). Returns null when the
 * player backs out of an optional choice the engine can take back.
 */
export async function answerPrompt(prompt: Prompt, ctx: PromptContext): Promise<EngineResponse | null> {
  const r: SelectRequest = prompt.request;
  if (prompt.retry) showToast('Diese Auswahl ist nicht möglich – bitte noch einmal wählen.', 'error');
  switch (r.type) {
    case Msg.SELECT_CARD:
    case Msg.SELECT_TRIBUTE: {
      if (r.type === Msg.SELECT_CARD && prompt.hint === 549) {
        const target = ctx.takeAttackTarget();
        const index = target ? r.selects.findIndex((c) => c.controller === target.controller && c.location === target.location && c.sequence === target.sequence) : -1;
        if (index >= 0) return { type: Res.SELECT_CARD, indicies: [index] };
      }
      const list = r.selects as CardLocPos[];
      const chosen = await (r.can_cancel ? selectInstances : (o: Parameters<typeof selectInstances>[0]) => required(() => selectInstances(o)))({
        title: title(prompt, 'Karte(n) wählen', ctx),
        items: items(list, ctx),
        min: r.min,
        max: r.max,
      });
      const indicies = chosen ? chosen.map(Number) : null;
      return r.type === Msg.SELECT_CARD ? { type: Res.SELECT_CARD, indicies } : { type: Res.SELECT_TRIBUTE, indicies };
    }
    case Msg.SELECT_SUM: {
      const must = r.selects_must.map((c) => ctx.nameOf(c.code)).join(', ');
      const chosen = await required(() =>
        selectInstances({
          title: title(prompt, 'Karten wählen', ctx),
          message: `Benötigte Summe: ${r.amount}${must ? ` (fest dabei: ${must})` : ''}`,
          items: items(r.selects, ctx),
          min: 1,
          max: r.selects.length,
        })
      );
      return { type: Res.SELECT_SUM, indicies: chosen.map(Number) };
    }
    case Msg.SELECT_UNSELECT_CARD: {
      const result = await showPile({
        title: `${title(prompt, 'Karte wählen', ctx)} (${r.unselect_cards.length} gewählt)`,
        items: [...items(r.select_cards, ctx, 's'), ...items(r.unselect_cards, ctx, 'u').map((i) => ({ ...i, caption: `${i.caption} · abwählen` }))],
        action: r.can_finish ? 'Fertig' : undefined,
      });
      if (result === 'action' || (result === null && (r.can_finish || r.can_cancel))) return { type: Res.SELECT_UNSELECT_CARD, index: null };
      if (result === null) return answerPrompt({ ...prompt, retry: false }, ctx);
      const index = result.startsWith('s') ? Number(result.slice(1)) : r.select_cards.length + Number(result.slice(1));
      return { type: Res.SELECT_UNSELECT_CARD, index };
    }
    case Msg.SELECT_CHAIN: {
      // Like EDOPro: only ask when an effect responds to what just happened, unless the player wants every chance.
      if (r.selects.length === 0 || (!r.forced && r.spe_count === 0 && !ctx.alwaysChain)) return { type: Res.SELECT_CHAIN, index: null };
      const options: ChoiceOption<number>[] = r.selects.map((c, i) => {
        const effect = describe(c.description, ctx.sources);
        return { label: `${ctx.nameOf(c.code)}${effect ? ` – ${effect}` : ''}`, value: i, testID: `chain-${i}` };
      });
      if (!r.forced) options.push({ label: 'Nicht ketten', value: -1, testID: 'chain-pass' });
      const answer = await chooseOption({ title: r.forced ? 'Effekt aktivieren (Pflicht)' : 'Mit einem Effekt antworten?', options });
      if (answer === null || answer === -1) return r.forced ? { type: Res.SELECT_CHAIN, index: 0 } : { type: Res.SELECT_CHAIN, index: null };
      return { type: Res.SELECT_CHAIN, index: answer };
    }
    case Msg.SELECT_EFFECTYN:
      return { type: Res.SELECT_EFFECTYN, yes: await yesNo(`${ctx.nameOf(r.code)}: Effekt aktivieren?`, describe(r.description, ctx.sources)) };
    case Msg.SELECT_YESNO:
      return { type: Res.SELECT_YESNO, yes: await yesNo(describe(r.description, ctx.sources) || 'Ja oder nein?', '') };
    case Msg.SELECT_OPTION: {
      const index = await required(() =>
        chooseOption({
          title: title(prompt, 'Option wählen', ctx),
          options: r.options.map((o, i) => ({ label: describe(o, ctx.sources) || `Option ${i + 1}`, value: i, testID: `option-${i}` })),
        })
      );
      return { type: Res.SELECT_OPTION, index };
    }
    case Msg.SELECT_POSITION: {
      const options = POSITION_LABELS.filter(([p]) => r.positions & p).map(([value, label]) => ({ label, value, testID: `position-${value}` }));
      if (options.length === 1) return { type: Res.SELECT_POSITION, position: options[0].value };
      const position = await required(() => chooseOption({ title: `${ctx.nameOf(r.code)}: Kampfposition`, options }));
      return { type: Res.SELECT_POSITION, position };
    }
    case Msg.SELECT_PLACE:
    case Msg.SELECT_DISFIELD: {
      const free: ReturnType<typeof zoneLabel>[] = [];
      for (let bit = 0; bit < 32; bit++) if (!(r.field_mask & (1 << bit)) && bit % 16 !== 7 && (bit % 16 < 8 ? bit % 8 < 7 : true)) free.push(zoneLabel(bit, ctx, r.player));
      const wished = ctx.takePlace();
      const preferred = wished && free.find((f) => f.place.player === wished.controller && f.place.location === wished.location && f.place.sequence === wished.sequence);
      const type = r.type === Msg.SELECT_PLACE ? Res.SELECT_PLACE : Res.SELECT_DISFIELD;
      if (r.count === 1 && (preferred || free.length === 1)) return { type, places: [(preferred ?? free[0]).place] };
      // Plain placement after a tap: take a free zone (centre first). Dragging the card picks the zone.
      const plainPlacement = r.type === Msg.SELECT_PLACE && r.count === 1 && prompt.hint !== 570 && prompt.hint !== 571;
      if (plainPlacement) {
        const order = [2, 1, 3, 0, 4, 5, 6];
        const own = free.filter((f) => f.place.player === r.player).sort((a, b) => order.indexOf(a.place.sequence) - order.indexOf(b.place.sequence));
        if (own.length > 0) return { type, places: [own[0].place] };
      }
      const places: { player: Player; location: number; sequence: number }[] = [];
      for (let i = 0; i < r.count; i++) {
        const left = free.filter((f) => !places.includes(f.place));
        const place = await required(() =>
          chooseOption({ title: title(prompt, 'Zone wählen', ctx), options: left.map((f, j) => ({ label: f.label, value: f.place, testID: `place-${j}` })) })
        );
        places.push(place);
        if (i < r.count - 1) await afterModal();
      }
      return { type, places };
    }
    case Msg.SELECT_COUNTER: {
      const counters = r.cards.map(() => 0);
      let left = r.count;
      r.cards.forEach((c, i) => {
        const take = Math.min(left, c.count);
        counters[i] = take;
        left -= take;
      });
      return { type: Res.SELECT_COUNTER, counters };
    }
    case Msg.SORT_CARD:
    case Msg.SORT_CHAIN:
      return { type: Res.SORT_CARD, order: null };
    case Msg.ANNOUNCE_ATTRIB:
    case Msg.ANNOUNCE_RACE: {
      const names = r.type === Msg.ANNOUNCE_ATTRIB ? ATTRIBUTE_BITS.map((a) => ATTRIBUTE_LABELS[a] ?? a) : RACE_BITS.map((race) => RACE_LABELS[race] ?? race);
      const picked: number[] = [];
      for (let i = 0; i < r.count; i++) {
        const options = names.map((label, bit) => ({ label, value: 2 ** bit })).filter((o) => r.available & o.value && !picked.includes(o.value));
        picked.push(await required(() => chooseOption({ title: r.type === Msg.ANNOUNCE_ATTRIB ? 'Eigenschaft ansagen' : 'Typ ansagen', options })));
        if (i < r.count - 1) await afterModal();
      }
      return r.type === Msg.ANNOUNCE_ATTRIB ? { type: Res.ANNOUNCE_ATTRIB, attributes: picked } : { type: Res.ANNOUNCE_RACE, races: picked };
    }
    case Msg.ANNOUNCE_CARD: {
      const ids = await required(() => pickCards({ title: 'Kartennamen ansagen' }));
      return { type: Res.ANNOUNCE_CARD, card: ids[0] };
    }
    case Msg.ANNOUNCE_NUMBER: {
      const value = await required(() =>
        chooseOption({ title: title(prompt, 'Zahl ansagen', ctx), options: r.options.map((n, i) => ({ label: String(n), value: i, testID: `number-${i}` })) })
      );
      return { type: Res.ANNOUNCE_NUMBER, value };
    }
    case Msg.ROCK_PAPER_SCISSORS: {
      const value = await required(() =>
        chooseOption<1 | 2 | 3>({
          title: 'Schere, Stein, Papier',
          options: [
            { label: 'Schere', value: 1 },
            { label: 'Stein', value: 2 },
            { label: 'Papier', value: 3 },
          ],
        })
      );
      return { type: Res.ROCK_PAPER_SCISSORS, value };
    }
    default:
      return null;
  }
}
