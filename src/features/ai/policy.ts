import { BattleAction, CardType, HintMsg, IdleAction, Loc, Msg, Pos, Res } from '@/features/engine/ocg';
import type {
  CardLoc,
  EngineResponse,
  FieldPlace,
  Player,
  Prompt,
  SelectBattleCmd,
  SelectCard,
  SelectChain,
  SelectIdleCmd,
  SelectPlace,
  SelectSum,
  SelectTribute,
  SelectUnselectCard,
  Snapshot,
} from '@/features/engine/types';

export type CardInfo = { type: number; attack: number; defense: number; level: number };

/** What the AI may know and use: its own view of the field and the card data. */
export type AiContext = {
  me: Player;
  snapshot: Snapshot;
  card: (code: number) => CardInfo | undefined;
  rng: () => number;
  /** A passcode matching an ANNOUNCE_CARD declaration (opcodes). */
  announce: (opcodes: number[]) => number;
  memory: AiMemory;
  /** In simulations the human side never chains (it cannot be predicted). */
  passive?: boolean;
};

/** State the AI keeps between decisions. */
export type AiMemory = {
  turn: number;
  actions: number;
  used: Map<string, number>;
  attackerAtk: number | null;
  retries: number;
};

export function newMemory(): AiMemory {
  return { turn: -1, actions: 0, used: new Map(), attackerAtk: null, retries: 0 };
}

const MAX_ACTIONS_PER_TURN = 24;

/** Rough worth of a card for the AI's choices. */
export function cardValue(info: CardInfo | undefined): number {
  if (!info) return 1000;
  if (info.type & CardType.MONSTER) {
    const extra = info.type & (CardType.FUSION | CardType.SYNCHRO | CardType.XYZ | CardType.LINK) ? 400 : 0;
    return info.attack + info.defense / 4 + info.level * 40 + extra;
  }
  return 1200;
}

function fieldMonsters(s: Snapshot, p: Player) {
  return s.players[p].mzone.filter((c): c is NonNullable<typeof c> => c !== null);
}

/** Highest ATK of the opponent's face-up monsters (0 if none). */
function strongestOpponent(ctx: AiContext): number {
  return Math.max(0, ...fieldMonsters(ctx.snapshot, (1 - ctx.me) as Player).map((c) => (c.code ? (c.attack ?? 0) : 0)));
}

function startTurn(ctx: AiContext) {
  if (ctx.memory.turn !== ctx.snapshot.turn) {
    ctx.memory.turn = ctx.snapshot.turn;
    ctx.memory.actions = 0;
    ctx.memory.used.clear();
  }
}

const key = (c: CardLoc, extra: string | number = '') => `${c.code}:${c.location}:${extra}`;

function idle(ctx: AiContext, r: SelectIdleCmd): EngineResponse {
  startTurn(ctx);
  const m = ctx.memory;
  const pick = (action: number, index: number): EngineResponse => {
    m.actions++;
    return { type: Res.SELECT_IDLECMD, action, index };
  };
  const end = (): EngineResponse =>
    r.to_bp && fieldMonsters(ctx.snapshot, ctx.me).some((c) => !(c.position & Pos.DEFENSE)) && ctx.snapshot.phase < 0x100
      ? { type: Res.SELECT_IDLECMD, action: IdleAction.TO_BP, index: null }
      : { type: Res.SELECT_IDLECMD, action: IdleAction.TO_EP, index: null };
  if (m.actions >= MAX_ACTIONS_PER_TURN) return end();
  const info = (c: CardLoc) => ctx.card(c.code);
  const canUse = (k: string, limit = 1) => (m.used.get(k) ?? 0) < limit;
  const spend = (k: string) => m.used.set(k, (m.used.get(k) ?? 0) + 1);

  // Effects: most cards are played for their effects; each effect at most twice per turn.
  const activations = r.activates.map((c, i) => ({ c, i })).filter(({ c }) => ctx.rng() < 0.8 && canUse(key(c, c.description), 2));
  if (activations.length > 0) {
    const { c, i } = activations[Math.floor(ctx.rng() * activations.length)];
    spend(key(c, c.description));
    return pick(IdleAction.ACTIVATE, i);
  }

  // Strongest Normal/Tribute Summon.
  if (r.summons.length > 0) {
    const best = r.summons.map((c, i) => ({ i, v: cardValue(info(c)) })).sort((a, b) => b.v - a.v)[0];
    return pick(IdleAction.SUMMON, best.i);
  }

  // Special Summons that improve the board (Extra Deck monsters only if stronger).
  const bestOwn = Math.max(0, ...fieldMonsters(ctx.snapshot, ctx.me).map((c) => c.attack ?? 0));
  const specials = r.special_summons
    .map((c, i) => ({ c, i, atk: info(c)?.attack ?? 0 }))
    .filter(({ c, atk }) => (c.location !== Loc.EXTRA || atk > bestOwn) && canUse(key(c, 'ss'), 2))
    .sort((a, b) => b.atk - a.atk);
  if (specials.length > 0) {
    spend(key(specials[0].c, 'ss'));
    return pick(IdleAction.SPECIAL_SUMMON, specials[0].i);
  }

  // Set defensive monsters and all traps / quick-play spells.
  const sets = r.monster_sets.map((c, i) => ({ c, i })).filter(({ c }) => (info(c)?.defense ?? 0) > (info(c)?.attack ?? 0));
  if (sets.length > 0) return pick(IdleAction.MONSTER_SET, sets[0].i);
  const spellSets = r.spell_sets.map((c, i) => ({ c, i })).filter(({ c }) => ((info(c)?.type ?? 0) & (CardType.TRAP | CardType.QUICKPLAY)) !== 0);
  if (spellSets.length > 0) return pick(IdleAction.SPELL_SET, spellSets[0].i);

  // Switch defenders to attack when they beat the opponent's best monster.
  const threat = strongestOpponent(ctx);
  const repos = r.pos_changes
    .map((c, i) => ({ c, i, view: ctx.snapshot.players[ctx.me].mzone[c.sequence] }))
    .filter(({ c, view }) => view && view.position & Pos.DEFENSE && (view.attack ?? 0) > threat && canUse(key(c, 'pos')));
  if (repos.length > 0) {
    spend(key(repos[0].c, 'pos'));
    return pick(IdleAction.POS_CHANGE, repos[0].i);
  }
  return end();
}

function battle(ctx: AiContext, r: SelectBattleCmd): EngineResponse {
  const opp = (1 - ctx.me) as Player;
  const defenders = fieldMonsters(ctx.snapshot, opp);
  const stat = (c: (typeof defenders)[number]) => (c.code === 0 ? 1500 : c.position & Pos.DEFENSE ? (c.defense ?? 0) : (c.attack ?? 0));
  const weakest = defenders.length ? Math.min(...defenders.map(stat)) : 0;
  const attackers = r.attacks
    .map((c, i) => ({ c, i, atk: ctx.snapshot.players[ctx.me].mzone[c.sequence]?.attack ?? ctx.card(c.code)?.attack ?? 0 }))
    .filter(({ c, atk }) => (defenders.length === 0 && c.can_direct) || atk > weakest || (c.can_direct && atk > 0 && defenders.length === 0))
    .sort((a, b) => b.atk - a.atk);
  if (attackers.length > 0) {
    ctx.memory.attackerAtk = attackers[0].atk;
    return { type: Res.SELECT_BATTLECMD, action: BattleAction.ATTACK, index: attackers[0].i };
  }
  if (r.to_m2) return { type: Res.SELECT_BATTLECMD, action: BattleAction.TO_M2, index: null };
  return { type: Res.SELECT_BATTLECMD, action: BattleAction.TO_EP, index: null };
}

type Mode = 'cost' | 'bad' | 'good';

function selectionMode(hint: number | null, candidates: CardLoc[], me: Player): Mode {
  switch (hint) {
    case HintMsg.RELEASE:
    case HintMsg.DISCARD:
    case HintMsg.TRIBUTE:
    case HintMsg.REMOVEXYZ:
    case HintMsg.FMATERIAL:
    case HintMsg.SMATERIAL:
    case HintMsg.XMATERIAL:
    case HintMsg.LMATERIAL:
      return 'cost';
    case HintMsg.DESTROY:
    case HintMsg.REMOVE:
    case HintMsg.RTOHAND:
    case HintMsg.TODECK:
    case HintMsg.CONTROL:
    case HintMsg.ATTACKTARGET:
      return 'bad';
    case HintMsg.TOGRAVE:
      return candidates.every((c) => c.location === Loc.DECK) ? 'good' : 'bad';
    case HintMsg.TARGET:
      return candidates.some((c) => c.controller !== me) ? 'bad' : 'good';
    default:
      return 'good';
  }
}

/** Orders candidates by how much the AI wants to pick them. */
function rank(ctx: AiContext, candidates: CardLoc[], mode: Mode): number[] {
  const scored = candidates.map((c, i) => {
    const v = cardValue(ctx.card(c.code));
    const own = c.controller === ctx.me;
    let score: number;
    if (mode === 'cost') score = own ? -v : -v - 10000;
    else if (mode === 'bad') score = own ? -v - 10000 : v;
    else score = own ? v : -v - 10000;
    return { i, score: score + ctx.rng() };
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.i);
}

function attackTarget(ctx: AiContext, r: SelectCard): number[] {
  const atk = ctx.memory.attackerAtk ?? 0;
  const options = r.selects.map((c, i) => {
    const view = ctx.snapshot.players[c.controller].mzone[c.sequence];
    const stat = !view || view.code === 0 ? 1500 : view.position & Pos.DEFENSE ? (view.defense ?? 0) : (view.attack ?? 0);
    return { i, stat, value: cardValue(ctx.card(c.code)) };
  });
  const beatable = options.filter((o) => o.stat < atk).sort((a, b) => b.value - a.value);
  return [(beatable[0] ?? options.sort((a, b) => a.stat - b.stat)[0]).i];
}

function selectCard(ctx: AiContext, r: SelectCard, hint: number | null): EngineResponse {
  if (hint === HintMsg.ATTACKTARGET) return { type: Res.SELECT_CARD, indicies: attackTarget(ctx, r) };
  const mode = selectionMode(hint, r.selects, ctx.me);
  const order = rank(ctx, r.selects, mode);
  const count = mode === 'bad' ? Math.max(r.min, Math.min(r.max, order.filter((i) => r.selects[i].controller !== ctx.me).length)) : r.min;
  return { type: Res.SELECT_CARD, indicies: order.slice(0, Math.max(r.min, Math.min(count, r.max))) };
}

function selectTribute(ctx: AiContext, r: SelectTribute): EngineResponse {
  const order = rank(ctx, r.selects, 'cost');
  const chosen: number[] = [];
  let weight = 0;
  for (const i of order) {
    if (weight >= r.min) break;
    chosen.push(i);
    weight += Math.max(1, r.selects[i].release_param & 0xff || 1);
  }
  return { type: Res.SELECT_TRIBUTE, indicies: chosen };
}

function selectUnselect(ctx: AiContext, r: SelectUnselectCard, hint: number | null): EngineResponse {
  const picked = r.unselect_cards.length;
  if (r.can_finish && (picked >= r.min || r.select_cards.length === 0)) return { type: Res.SELECT_UNSELECT_CARD, index: null };
  if (r.select_cards.length === 0) return { type: Res.SELECT_UNSELECT_CARD, index: null };
  const order = rank(ctx, r.select_cards, selectionMode(hint, r.select_cards, ctx.me));
  return { type: Res.SELECT_UNSELECT_CARD, index: order[0] };
}

/** Index sets whose amounts reach the requested sum; cheapest first. */
export function sumCombinations(r: Pick<SelectSum, 'selects' | 'selects_must' | 'amount' | 'select_max' | 'min' | 'max'>, limit = 20): number[][] {
  const values = (amount: number) => {
    const a = amount & 0xffff;
    const b = amount >>> 16;
    return b && b !== a ? [a, b] : [a];
  };
  const mustSums = r.selects_must.reduce<number[]>((sums, c) => sums.flatMap((s) => values(c.amount).map((v) => s + v)), [0]);
  const results: number[][] = [];
  const target = r.amount;
  const exact = r.select_max === 0;
  const walk = (start: number, chosen: number[], sums: number[]) => {
    if (results.length >= limit) return;
    const count = chosen.length + r.selects_must.length;
    const ok = sums.some((s) => (exact ? s === target : s >= target));
    if (ok && count >= Math.max(1, r.min)) {
      results.push([...chosen]);
      if (!exact) return;
    }
    if (r.max > 0 && count >= r.max) return;
    for (let i = start; i < r.selects.length; i++) {
      const next = sums.flatMap((s) => values(r.selects[i].amount).map((v) => s + v));
      if (exact && next.every((s) => s > target)) continue;
      walk(i + 1, [...chosen, i], next);
    }
  };
  walk(0, [], mustSums);
  return results.sort((a, b) => a.length - b.length);
}

function chain(ctx: AiContext, r: SelectChain): EngineResponse {
  if (r.selects.length === 0) return { type: Res.SELECT_CHAIN, index: null };
  if (r.forced) return { type: Res.SELECT_CHAIN, index: 0 };
  if (ctx.passive) return { type: Res.SELECT_CHAIN, index: null };
  const opponentActing = ctx.snapshot.chain.some((link) => link.controller !== ctx.me) || ctx.snapshot.turnPlayer !== ctx.me;
  const chance = opponentActing ? 0.75 : 0.6;
  if (ctx.rng() < chance) return { type: Res.SELECT_CHAIN, index: Math.floor(ctx.rng() * r.selects.length) };
  return { type: Res.SELECT_CHAIN, index: null };
}

/** Free zone from a field mask (set bits are blocked); centre zones first. */
export function freePlaces(r: Pick<SelectPlace, 'player' | 'field_mask' | 'count'>, preferOwn = true): FieldPlace[] {
  const order = [2, 1, 3, 0, 4, 5, 6, 7];
  const places: FieldPlace[] = [];
  const sides = preferOwn ? [0, 16] : [16, 0];
  for (const base of sides) {
    for (const loc of [0, 8]) {
      for (const seq of order) {
        const bit = base + loc + seq;
        if (seq > (loc === 0 ? 6 : 7) || r.field_mask & (1 << bit)) continue;
        places.push({ player: (base === 0 ? r.player : 1 - r.player) as Player, location: loc === 0 ? Loc.MZONE : Loc.SZONE, sequence: seq });
      }
    }
  }
  return places;
}

function position(ctx: AiContext, code: number, positions: number): EngineResponse {
  const info = ctx.card(code);
  const attack = info ? info.attack >= Math.max(1500, strongestOpponent(ctx)) || info.attack >= info.defense : true;
  const preference = attack ? [Pos.FACEUP_ATTACK, Pos.FACEUP_DEFENSE, Pos.FACEDOWN_DEFENSE, Pos.FACEDOWN_ATTACK] : [Pos.FACEUP_DEFENSE, Pos.FACEDOWN_DEFENSE, Pos.FACEUP_ATTACK, Pos.FACEDOWN_ATTACK];
  return { type: Res.SELECT_POSITION, position: preference.find((p) => positions & p) ?? Pos.FACEUP_ATTACK };
}

const bits = (mask: number, count: number) => {
  const out: number[] = [];
  for (let b = 0; b < 32 && out.length < count; b++) if (mask & (2 ** b)) out.push(2 ** b);
  return out;
};

/** Level 1 AI: a valid, reasonable answer to every engine request. */
export function respond(ctx: AiContext, prompt: Prompt): EngineResponse {
  const r = prompt.request;
  if (!prompt.retry) ctx.memory.retries = 0;
  else ctx.memory.retries++;
  switch (r.type) {
    case Msg.SELECT_IDLECMD:
      return ctx.memory.retries > 0 ? { type: Res.SELECT_IDLECMD, action: r.to_ep ? IdleAction.TO_EP : IdleAction.TO_BP, index: null } : idle(ctx, r);
    case Msg.SELECT_BATTLECMD:
      return battle(ctx, r);
    case Msg.SELECT_CARD:
      return ctx.memory.retries > 2 && r.can_cancel ? { type: Res.SELECT_CARD, indicies: null } : selectCard(ctx, r, prompt.hint);
    case Msg.SELECT_TRIBUTE:
      return selectTribute(ctx, r);
    case Msg.SELECT_UNSELECT_CARD:
      return selectUnselect(ctx, r, prompt.hint);
    case Msg.SELECT_SUM: {
      const combos = sumCombinations(r);
      const combo = combos[ctx.memory.retries % Math.max(1, combos.length)] ?? r.selects.map((_, i) => i);
      return { type: Res.SELECT_SUM, indicies: combo };
    }
    case Msg.SELECT_CHAIN:
      return chain(ctx, r);
    case Msg.SELECT_EFFECTYN:
      return { type: Res.SELECT_EFFECTYN, yes: !ctx.passive };
    case Msg.SELECT_YESNO:
      return { type: Res.SELECT_YESNO, yes: !ctx.passive };
    case Msg.SELECT_OPTION:
      return { type: Res.SELECT_OPTION, index: Math.min(r.options.length - 1, ctx.memory.retries) };
    case Msg.SELECT_PLACE:
    case Msg.SELECT_DISFIELD: {
      const places = freePlaces(r, r.type === Msg.SELECT_PLACE);
      const offset = ctx.memory.retries % Math.max(1, places.length);
      return { type: r.type === Msg.SELECT_PLACE ? Res.SELECT_PLACE : Res.SELECT_DISFIELD, places: places.slice(offset, offset + r.count) };
    }
    case Msg.SELECT_POSITION:
      return position(ctx, r.code, r.positions);
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
    case Msg.ANNOUNCE_RACE:
      return { type: Res.ANNOUNCE_RACE, races: bits(r.available, r.count) };
    case Msg.ANNOUNCE_ATTRIB:
      return { type: Res.ANNOUNCE_ATTRIB, attributes: bits(r.available, r.count) };
    case Msg.ANNOUNCE_CARD:
      return { type: Res.ANNOUNCE_CARD, card: ctx.announce(r.opcodes) };
    case Msg.ANNOUNCE_NUMBER:
      return { type: Res.ANNOUNCE_NUMBER, value: Math.min(r.options.length - 1, ctx.memory.retries) };
    case Msg.ROCK_PAPER_SCISSORS:
      return { type: Res.ROCK_PAPER_SCISSORS, value: (1 + Math.floor(ctx.rng() * 3)) as 1 | 2 | 3 };
  }
}
