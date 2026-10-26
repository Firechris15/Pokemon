import { cardActions, describe as describeEffect, dropActions, phaseActions } from '@/features/engine/actions';
import { cdbRowStrings, cdbRowToCard, packCard, parseStringsConf, unpackCard, type CdbRow } from '@/features/engine/cardData';
import { logText } from '@/features/engine/logText';
import { Loc, Msg, Pos, signedLp, splitDescription } from '@/features/engine/ocg';
import { PRESET_DECKS } from '@/features/engine/presetDecks';
import { referencedScripts, scriptPaths } from '@/features/engine/scriptRefs';
import type { CardView, Player, PlayerView, Prompt, Snapshot } from '@/features/engine/types';
import { boardTarget, engineUid, parseEngineUid, snapshotToDuelState } from '@/features/engine/view';

const card = (code: number, controller: Player, location: number, sequence: number, extra: Partial<CardView> = {}): CardView => ({
  code,
  controller,
  owner: controller,
  location,
  sequence,
  position: Pos.FACEUP_ATTACK,
  type: 0x11,
  attack: 1000,
  defense: 1000,
  baseAttack: 1000,
  baseDefense: 1000,
  materials: [],
  isPublic: true,
  ...extra,
});

function player(lp: number): PlayerView {
  return { lp, hand: [], mzone: Array(7).fill(null), szone: Array(8).fill(null), grave: [], removed: [], extra: [], deckCount: 30 };
}

describe('EDOPro card data', () => {
  const row = (overrides: Partial<CdbRow>): CdbRow =>
    ({ code: 1, alias: 0, type: 0x21, atk: 1000, def: 500, level: 4, lscale: 0, rscale: 0, race: 1, attribute: 32, s0: 0x19c, s1: 0, s2: 0x10, s3: 0, name: 'X', ...overrides }) as CdbRow;

  it('reads setcodes, link markers and scales', () => {
    expect(cdbRowToCard(row({})).setcodes).toEqual([0x19c, 0x10]);
    const link = cdbRowToCard(row({ type: 0x4000021, def: 0x28, level: 2 }));
    expect(link).toMatchObject({ defense: 0, linkMarker: 0x28, level: 2 });
    expect(cdbRowToCard(row({ lscale: 4, rscale: 4 })).lscale).toBe(4);
  });

  it('packs cards compactly and keeps the effect strings', () => {
    const c = cdbRowToCard(row({}));
    expect(unpackCard(packCard(c))).toEqual(c);
    expect(cdbRowStrings(row({ str1: 'Negate', str2: '', str3: null } as never))).toEqual(['Negate']);
  });

  it('parses EDOPro system strings', () => {
    const strings = parseStringsConf('#comment\n!system 500 Select the card(s) to Tribute\n!victory 0x1 LP reached 0\n!system 1 Normal Summon');
    expect(strings.get(500)).toBe('Select the card(s) to Tribute');
    expect(strings.size).toBe(2);
  });

  it('finds scripts a script loads itself', () => {
    expect(referencedScripts('Duel.LoadScript("proc_fusion.lua")\nDuel.LoadScript("proc_fusion.lua")\nDuel.LoadCardScript("c123.lua")')).toEqual(['proc_fusion.lua', 'c123.lua']);
    expect(scriptPaths('c46986414.lua')).toEqual(['official/c46986414.lua', 'pre-release/c46986414.lua']);
    expect(scriptPaths('utility.lua')).toEqual(['utility.lua']);
  });

  it('handles packed numbers', () => {
    expect(splitDescription(14558127 * 16 + 1)).toEqual({ code: 14558127, index: 1 });
    expect(signedLp(4294964996)).toBe(-2300);
    expect(signedLp(8000)).toBe(8000);
  });

  it('ships two legal 40-card preset decks', () => {
    for (const deck of PRESET_DECKS) {
      expect(deck.main).toHaveLength(40);
      const counts = new Map<number, number>();
      for (const code of deck.main) counts.set(code, (counts.get(code) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    }
  });
});

describe('engine view', () => {
  const snapshot = (): Snapshot => {
    const players: [PlayerView, PlayerView] = [player(8000), player(6500)];
    players[1].mzone[0] = card(70781052, 1, Loc.MZONE, 0);
    players[1].mzone[5] = card(41999284, 1, Loc.MZONE, 5);
    players[0].mzone[5] = card(86066372, 0, Loc.MZONE, 5, { attack: 2800 });
    players[0].szone[5] = card(12345, 0, Loc.SZONE, 5);
    players[0].hand = [card(0, 0, Loc.HAND, 0, { isPublic: false })];
    players[0].mzone[2] = card(91152256, 0, Loc.MZONE, 2, { position: Pos.FACEDOWN_DEFENSE });
    return { viewer: 1, players, turn: 3, turnPlayer: 1, phase: 4, chain: [] };
  };

  it('puts the viewer at the bottom and mirrors the Extra Monster Zones', () => {
    const state = snapshotToDuelState(snapshot());
    expect(state.me.lp).toBe(6500);
    expect(state.me.monster[0]?.cardId).toBe(70781052);
    // Your zone 5 is your left EMZ; the opponent's zone 5 is on your right.
    expect(state.emz[0]?.cardId).toBe(41999284);
    expect(state.emz[0]?.owner).toBe('me');
    expect(state.emz[1]?.cardId).toBe(86066372);
    expect(state.emz[1]?.owner).toBe('opp');
    expect(state.opp.field[0]?.cardId).toBe(12345);
    expect(state.opp.hand[0].cardId).toBe(0);
    expect(state.me.deck).toHaveLength(30);
    expect(state.emz[1]?.atk).toBe(2800);
    expect(state.opp.monster[2]).toMatchObject({ faceUp: false, defense: true });
  });

  it('round-trips board uids and maps drop targets to engine zones', () => {
    expect(parseEngineUid(engineUid(1, Loc.MZONE, 3))).toEqual({ controller: 1, location: Loc.MZONE, sequence: 3 });
    expect(parseEngineUid('x')).toBeNull();
    expect(boardTarget({ side: 'me', zone: 'emz', index: 0 }, 1)).toEqual({ controller: 1, location: Loc.MZONE, sequence: 5 });
    expect(boardTarget({ side: 'opp', zone: 'emz', index: 0 }, 1)).toEqual({ controller: 0, location: Loc.MZONE, sequence: 6 });
    expect(boardTarget({ side: 'opp', zone: 'monster', index: 2 }, 0)).toEqual({ controller: 1, location: Loc.MZONE, sequence: 2 });
    expect(boardTarget({ side: 'me', zone: 'field' }, 0)).toEqual({ controller: 0, location: Loc.SZONE, sequence: 5 });
  });
});

describe('engine actions', () => {
  const sources = { strings: new Map([[14558127, ['Negate that effect']]]), system: new Map<number, string>() };
  const idle: Prompt = {
    hint: null,
    retry: false,
    request: {
      type: Msg.SELECT_IDLECMD,
      player: 0,
      summons: [{ code: 1, controller: 0, location: Loc.HAND, sequence: 2 }],
      special_summons: [],
      pos_changes: [],
      monster_sets: [{ code: 1, controller: 0, location: Loc.HAND, sequence: 2 }],
      spell_sets: [],
      activates: [{ code: 14558127, controller: 0, location: Loc.HAND, sequence: 2, description: 14558127 * 16 }],
      to_bp: true,
      to_ep: true,
      shuffle: false,
    },
  };

  it('lists what a card can do', () => {
    const actions = cardActions(idle, { controller: 0, location: Loc.HAND, sequence: 2 }, sources);
    expect(actions.map((a) => a.kind)).toEqual(['summon', 'mset', 'activate']);
    expect(actions[2].label).toBe('Aktivieren: Negate that effect');
    expect(actions[0].response).toEqual({ type: 1, action: 0, index: 0 });
    expect(cardActions(idle, { controller: 0, location: Loc.HAND, sequence: 1 }, sources)).toEqual([]);
    expect(phaseActions(idle).map((a) => a.label)).toEqual(['Kampfphase', 'Zug beenden']);
  });

  it('narrows actions to the zone a card was dropped on', () => {
    const actions = cardActions(idle, { controller: 0, location: Loc.HAND, sequence: 2 }, sources);
    expect(dropActions(actions, { controller: 0, location: Loc.HAND }, { controller: 0, location: Loc.MZONE }).map((a) => a.kind)).toEqual(['summon', 'mset', 'activate']);
    expect(dropActions(actions, { controller: 0, location: Loc.HAND }, { controller: 0, location: Loc.SZONE }).map((a) => a.kind)).toEqual(['activate']);
    expect(dropActions(actions, { controller: 0, location: Loc.HAND }, { controller: 1, location: Loc.MZONE })).toEqual([]);
  });

  it('describes effects and system strings', () => {
    expect(describeEffect(14558127 * 16, sources)).toBe('Negate that effect');
    expect(describeEffect(500, sources)).toBe('Karte(n) zum Tributieren wählen');
    expect(describeEffect(0, sources)).toBe('');
  });
});

describe('duel log', () => {
  const nameOf = (code: number) => ({ 1: 'Ash', 2: 'Drache' })[code] ?? `#${code}`;
  const sources = { strings: new Map(), system: new Map() };

  it('hides the opponent’s draws and sets', () => {
    expect(logText({ k: 'draw', player: 0, codes: [1, 2] }, 0, nameOf, sources)).toBe('Du ziehst: Ash, Drache');
    expect(logText({ k: 'draw', player: 1, codes: [1, 2] }, 0, nameOf, sources)).toBe('Gegner zieht 2 Karten');
    expect(logText({ k: 'set', player: 1, code: 2, location: Loc.SZONE, secret: true }, 0, nameOf, sources)).toBe('Gegner setzt eine Karte');
    expect(logText({ k: 'move', player: 1, code: 2, from: Loc.HAND, to: Loc.DECK, toPlayer: 1, secret: true }, 0, nameOf, sources)).toBeNull();
  });

  it('writes summons, chains, attacks and the result', () => {
    expect(logText({ k: 'activate', player: 1, code: 1, location: Loc.HAND, description: 0, chain: 2 }, 0, nameOf, sources)).toBe('Kette 2: Gegner aktiviert Ash (Hand)');
    expect(logText({ k: 'attack', player: 0, code: 2, target: null }, 0, nameOf, sources)).toBe('Du: Drache greift direkt an');
    expect(logText({ k: 'damage', player: 1, amount: 3000 }, 0, nameOf, sources)).toBe('Gegner erhält 3000 Schaden');
    expect(logText({ k: 'win', player: 0, reason: 1 }, 0, nameOf, sources)).toBe('Du hast gewonnen!');
  });
});
