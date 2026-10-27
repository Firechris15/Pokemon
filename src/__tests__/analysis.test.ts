import { pickModel, type ModelOption } from '@/features/analysis/claude';
import { decisionOptions, sameResponse } from '@/features/analysis/options';
import { buildPrompt, mapSuggestions, prepareDecisions } from '@/features/analysis/prompt';
import { IdleAction, Loc, Msg, Res } from '@/features/engine/ocg';
import type { BoardSummary, DecisionPoint, LogEntry, ReplayData, ReplayInfo, SelectRequest, Snapshot } from '@/features/engine/types';
import { maskHidden } from '@/features/engine/view';
import type { Replay, ReplaySummary } from '@/features/replays/repository';
import { matchStats, outcomeOf, overallStats, winRate, type MatchStats } from '@/features/replays/stats';

const RAIGEKI = 12580477;
const names = { nameOf: (code: number) => ({ 1: 'Ash', 2: 'Drache', [RAIGEKI]: 'Raigeki', 4: 'Kuriboh' })[code] ?? `#${code}`, sources: { strings: new Map([[RAIGEKI, ['Zerstöre alle Monster']]]), system: new Map() } };

const idle: SelectRequest = {
  type: Msg.SELECT_IDLECMD,
  player: 0,
  summons: [{ code: 2, controller: 0, location: Loc.HAND, sequence: 0 }],
  special_summons: [],
  pos_changes: [],
  monster_sets: [{ code: 2, controller: 0, location: Loc.HAND, sequence: 0 }],
  spell_sets: [],
  activates: [{ code: RAIGEKI, controller: 0, location: Loc.HAND, sequence: 1, description: RAIGEKI * 16 }],
  to_bp: true,
  to_ep: true,
  shuffle: false,
};

const board: BoardSummary = {
  turn: 1,
  myTurn: true,
  phase: 4,
  me: { lp: 8000, hand: [2, RAIGEKI], deck: 30, monsters: [], spells: [], grave: [], banished: [], extra: 0 },
  opp: { lp: 8000, hand: [0, 0, 0], deck: 30, monsters: [{ code: 0, zone: 0, position: 8, attack: null, defense: null, materials: 0 }], spells: [], grave: [], banished: [], extra: 0 },
  chain: [],
};

const decision = (index: number, request: SelectRequest, response: DecisionPoint['response'], frame = index): DecisionPoint => ({ index, frame, request, hint: null, response, board });

describe('decision options', () => {
  it('lists every legal action of a main phase with its response', () => {
    const options = decisionOptions(idle, names);
    expect(options.map((o) => o.label)).toEqual([
      'Normalbeschwörung: Drache',
      'Verdeckt setzen: Drache',
      'Aktivieren: Raigeki (Hand) – Zerstöre alle Monster',
      'In die Battle Phase gehen',
      'Zug beenden',
    ]);
    expect(options[2].response).toEqual({ type: Res.SELECT_IDLECMD, action: IdleAction.ACTIVATE, index: 0 });
  });

  it('offers to pass first in chain decisions and yes/no for effects', () => {
    const chain = decisionOptions({ type: Msg.SELECT_CHAIN, player: 0, spe_count: 1, forced: false, hint_timing: 0, hint_timing_other: 0, selects: [{ code: 1, controller: 0, location: Loc.HAND, sequence: 0, position: 0, description: 0 }] }, names);
    expect(chain.map((o) => o.label)).toEqual(['Nicht reagieren (keine Kette)', 'Als Kette aktivieren: Ash (Hand)']);
    expect(chain[0].response).toEqual({ type: Res.SELECT_CHAIN, index: null });
    const yn = decisionOptions({ type: Msg.SELECT_EFFECTYN, player: 0, code: 4, controller: 0, location: Loc.HAND, sequence: 0, position: 0, description: 0 }, names);
    expect(yn.map((o) => o.response)).toEqual([
      { type: Res.SELECT_EFFECTYN, yes: true },
      { type: Res.SELECT_EFFECTYN, yes: false },
    ]);
  });

  it('compares responses by value', () => {
    expect(sameResponse({ type: 1, action: 5, index: 0 }, { index: 0, action: 5, type: 1 })).toBe(true);
    expect(sameResponse({ type: 1, action: 5, index: 0 }, { type: 1, action: 5, index: 1 })).toBe(false);
  });
});

describe('analysis prompt', () => {
  const log: LogEntry[] = [
    { k: 'draw', player: 0, codes: [2, RAIGEKI] },
    { k: 'draw', player: 1, codes: [1, 1] },
    { k: 'turn', turn: 1, player: 0 },
    { k: 'summon', player: 0, code: 2, location: Loc.MZONE },
    { k: 'win', player: 1, reason: 1 },
  ];
  const onlyEnd: SelectRequest = { ...idle, summons: [], monster_sets: [], activates: [], to_bp: false } as SelectRequest;
  const info: ReplayInfo = {
    frames: [
      { turn: 1, turnPlayer: 0, phase: 4, lp: [8000, 8000], logEnd: 3, response: 0 },
      { turn: 1, turnPlayer: 0, phase: 4, lp: [8000, 8000], logEnd: 4, response: 1 },
    ],
    decisions: [decision(0, idle, { type: Res.SELECT_IDLECMD, action: IdleAction.SUMMON, index: 0 }, 0), decision(1, onlyEnd, { type: Res.SELECT_IDLECMD, action: IdleAction.TO_EP, index: null }, 1)],
    diverged: null,
  };
  const replay = {
    id: 'r',
    createdAt: 0,
    mode: 'ai',
    title: 'Test',
    myDeck: 'Meins',
    oppDeck: 'KI-Deck',
    aiLevel: 2,
    winner: 1,
    viewer: 0,
    reason: 'Lebenspunkte auf 0',
    turns: 1,
    durationMs: 0,
    data: {
      config: {
        seed: ['1', '2', '3', '4'],
        players: [
          { name: 'Du', lp: 8000, main: [2, 2, RAIGEKI], extra: [], startHand: 5, drawPerTurn: 1, ai: null },
          { name: 'KI', lp: 8000, main: [1], extra: [], startHand: 5, drawPerTurn: 1, ai: 2 },
        ],
      },
      responses: [],
      log,
      result: { winner: 1, reason: 'Lebenspunkte auf 0' },
      turns: 1,
    },
  } as Replay;

  it('numbers the real decisions and marks them in the duel log', () => {
    const decisions = prepareDecisions(info, names);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ number: 1, chosen: 0 });
    const prompt = buildPrompt(replay, info, decisions, names);
    expect(prompt).toContain('Main Deck (3): 2× Drache, 1× Raigeki');
    expect(prompt).not.toContain('Ash');
    expect(prompt).toContain('— Zug 1: dein Zug —\n[E1] deine Entscheidung\nDu: Normalbeschwörung von Drache');
    expect(prompt).toContain('## E1 · Zug 1 (dein Zug) · Main Phase 1');
    expect(prompt).toContain('Hand des Gegners: 3 Karte(n)');
    expect(prompt).toContain('Gegnerische Monster: verdecktes Monster [verdeckt, Verteidigung]');
    expect(prompt).toContain('3. Aktivieren: Raigeki (Hand) – Zerstöre alle Monster\n4. In die Battle Phase gehen\n5. Zug beenden\nGewählt: 1');
    expect(prompt).toContain('Ergebnis: Verloren (Lebenspunkte auf 0) nach 1 Zügen · Du hast begonnen');
  });

  it('treats copies of the same card as one option', () => {
    const twoCopies = { ...idle, summons: [idle.summons[0], { ...idle.summons[0], sequence: 2 }] } as SelectRequest;
    const copies: ReplayInfo = { ...info, decisions: [decision(0, twoCopies, { type: Res.SELECT_IDLECMD, action: IdleAction.SUMMON, index: 1 }, 0)] };
    const [d] = prepareDecisions(copies, names);
    expect(d.options.filter((o) => o.label === 'Normalbeschwörung: Drache')).toHaveLength(1);
    expect(d.chosen).toBe(0);
    expect(mapSuggestions([{ decision: 1, option: 1, reason: 'die andere Kopie' }], [d])).toEqual({ suggestions: [], invalid: 1 });
  });

  it('maps suggestions to engine responses and drops invalid references', () => {
    const decisions = prepareDecisions(info, names);
    const { suggestions, invalid } = mapSuggestions(
      [
        { decision: 1, option: 3, reason: 'Raigeki zuerst' },
        { decision: 1, option: 1, reason: 'schon gespielt' },
        { decision: 1, option: 9, reason: 'gibt es nicht' },
        { decision: 4, option: 1, reason: 'gibt es nicht' },
      ],
      decisions
    );
    expect(invalid).toBe(3);
    expect(suggestions).toEqual([
      expect.objectContaining({ decision: 1, responseIndex: 0, frame: 0, chosenLabel: 'Normalbeschwörung: Drache', optionLabel: 'Aktivieren: Raigeki (Hand) – Zerstöre alle Monster', check: null }),
    ]);
    expect(suggestions[0].response).toEqual({ type: Res.SELECT_IDLECMD, action: IdleAction.ACTIVATE, index: 0 });
  });

  it('picks the stored model, otherwise the newest Opus', () => {
    const model = (id: string, createdAt: string): ModelOption => ({ id, name: id, createdAt, maxTokens: 64000, adaptive: true, effortHigh: true });
    const models = [model('x-sonnet', '2026-03-01'), model('x-opus', '2026-02-01'), model('y-opus', '2026-01-01')];
    expect(pickModel(models, null)?.id).toBe('x-opus');
    expect(pickModel(models, 'y-opus')?.id).toBe('y-opus');
    expect(pickModel(models, 'gone')?.id).toBe('x-opus');
    expect(pickModel([model('a', '1'), model('b', '2')], null)?.id).toBe('a');
    expect(pickModel([], null)).toBeNull();
  });
});

describe('match statistics', () => {
  const data = (log: LogEntry[]): ReplayData => ({
    config: { seed: ['1', '2', '3', '4'], players: [{ name: 'A', lp: 8000, main: [], extra: [], startHand: 5, drawPerTurn: 1, ai: 1 }, { name: 'B', lp: 8000, main: [], extra: [], startHand: 5, drawPerTurn: 1, ai: null }] },
    responses: [],
    log,
    result: { winner: 1, reason: '' },
    turns: 2,
  });

  it('tracks LP per turn, damage, negations and the most used cards from the viewer side', () => {
    const stats = matchStats(
      data([
        { k: 'draw', player: 0, codes: [1, 2, 3, 4, 5] },
        { k: 'turn', turn: 1, player: 0 },
        { k: 'activate', player: 0, code: 3, location: Loc.HAND, description: 0, chain: 1 },
        { k: 'activate', player: 1, code: 1, location: Loc.HAND, description: 0, chain: 2 },
        { k: 'resolved', chain: 2 },
        { k: 'negated', chain: 1 },
        { k: 'resolved', chain: 1 },
        { k: 'cost', player: 0, amount: 1000 },
        { k: 'turn', turn: 2, player: 1 },
        { k: 'summon', player: 1, code: 2, location: Loc.MZONE },
        { k: 'attack', player: 1, code: 2, target: null },
        { k: 'damage', player: 0, amount: 3000 },
        { k: 'recover', player: 1, amount: 500 },
      ]),
      1
    );
    expect(stats.firstPlayer).toBe('opp');
    expect(stats.turns).toBe(2);
    expect(stats.lpByTurn).toEqual([
      { turn: 0, me: 8000, opp: 8000 },
      { turn: 1, me: 8000, opp: 7000 },
      { turn: 2, me: 8500, opp: 4000 },
    ]);
    expect(stats.me).toMatchObject({ summons: 1, attacks: 1, damageDealt: 3000, recovered: 500, activations: 1, negated: 0 });
    expect(stats.opp).toMatchObject({ activations: 1, negated: 1, lpPaid: 1000, drawn: 5 });
    expect(stats.topCards).toEqual([{ code: 1, count: 1 }]);
    expect(stats.biggestHit).toEqual({ turn: 2, amount: 3000, toMe: false });
  });

  it('uses the LP from the engine for puzzles', () => {
    expect(matchStats(data([{ k: 'turn', turn: 1, player: 0 }]), 0, [8000, 3000]).lpByTurn.at(-1)).toEqual({ turn: 1, me: 8000, opp: 3000 });
  });

  it('sums up all AI duels', () => {
    const base: ReplaySummary = { id: '', createdAt: 0, mode: 'ai', title: '', myDeck: 'A', oppDeck: 'X', aiLevel: 1, winner: 0, viewer: 0, reason: 'Lebenspunkte auf 0', turns: 4, durationMs: 0 };
    const stats = (first: 'me' | 'opp', dealt: number): MatchStats => ({ ...matchStats(data([]), 0), firstPlayer: first, me: { ...matchStats(data([]), 0).me, damageDealt: dealt } });
    const replays = [
      { ...base, id: '1', createdAt: 1, stats: stats('me', 8000) },
      { ...base, id: '2', createdAt: 2, winner: 1 as const, myDeck: 'B', aiLevel: 2, stats: stats('opp', 2000) },
      { ...base, id: '3', createdAt: 3, stats: stats('me', 8000), turns: 6 },
      { ...base, id: '4', createdAt: 4, stats: stats('opp', 6000) },
      { ...base, id: 'p', createdAt: 5, mode: 'puzzle' as const, winner: 1 as const, stats: null },
    ];
    const overall = overallStats(replays);
    expect(overall).toMatchObject({ games: 4, wins: 3, losses: 1, draws: 0, avgTurns: 4.5, avgDamageDealt: 6000, recent: ['W', 'L', 'W', 'W'], streak: { outcome: 'W', count: 2 } });
    expect(overall.byDeck.map((g) => [g.label, g.games, g.wins])).toEqual([
      ['A', 3, 3],
      ['B', 1, 0],
    ]);
    expect(overall.byLevel.map((g) => g.label)).toEqual(['KI Stufe 1', 'KI Stufe 2']);
    expect(overall.byStart.find((g) => g.key === 'me')).toMatchObject({ games: 2, wins: 2, label: 'Du beginnst' });
    expect(overall.reasons).toEqual([{ reason: 'Lebenspunkte auf 0', wins: 3, losses: 1 }]);
    expect(winRate(overall)).toBe(0.75);
    expect(winRate({ games: 0, wins: 0, draws: 0 })).toBeNull();
    expect(outcomeOf({ winner: null, viewer: 0 })).toBe('D');
  });
});

describe('replay view', () => {
  it('hides what the viewer could not see unless the cards are revealed', () => {
    const card = { code: 5, controller: 1 as const, owner: 1 as const, location: Loc.HAND, sequence: 0, position: 0, type: 0x11, attack: 1000, defense: 500, baseAttack: 1000, baseDefense: 500, materials: [], isPublic: false };
    const player = { lp: 8000, hand: [{ ...card, hidden: true }, { ...card, sequence: 1 }], mzone: Array(7).fill(null), szone: Array(8).fill(null), grave: [], removed: [], extra: [], deckCount: 30 };
    const snapshot: Snapshot = { viewer: 0, players: [player, player], turn: 1, turnPlayer: 0, phase: 4, chain: [] };
    const masked = maskHidden(snapshot);
    expect(masked.players[1].hand.map((c) => c.code)).toEqual([0, 5]);
    expect(masked.players[1].hand[0].attack).toBeNull();
    expect(snapshot.players[1].hand[0].code).toBe(5);
  });
});
