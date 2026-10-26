/**
 * EDOPro (ocgcore) protocol constants. The app bundle uses these instead of
 * importing ocgcore-wasm, which is only loaded inside the engine worker.
 */

export const Msg = {
  RETRY: 1,
  HINT: 2,
  WIN: 5,
  SELECT_BATTLECMD: 10,
  SELECT_IDLECMD: 11,
  SELECT_EFFECTYN: 12,
  SELECT_YESNO: 13,
  SELECT_OPTION: 14,
  SELECT_CARD: 15,
  SELECT_CHAIN: 16,
  SELECT_PLACE: 18,
  SELECT_POSITION: 19,
  SELECT_TRIBUTE: 20,
  SORT_CHAIN: 21,
  SELECT_COUNTER: 22,
  SELECT_SUM: 23,
  SELECT_DISFIELD: 24,
  SORT_CARD: 25,
  SELECT_UNSELECT_CARD: 26,
  CONFIRM_CARDS: 31,
  SHUFFLE_HAND: 33,
  NEW_TURN: 40,
  NEW_PHASE: 41,
  MOVE: 50,
  POS_CHANGE: 53,
  SET: 54,
  SUMMONING: 60,
  SPSUMMONING: 62,
  FLIPSUMMONING: 64,
  CHAINING: 70,
  CHAIN_SOLVED: 73,
  CHAIN_END: 74,
  CHAIN_NEGATED: 75,
  CHAIN_DISABLED: 76,
  DRAW: 90,
  DAMAGE: 91,
  RECOVER: 92,
  LPUPDATE: 94,
  PAY_LPCOST: 100,
  ATTACK: 110,
  BATTLE: 111,
  TOSS_COIN: 130,
  TOSS_DICE: 131,
  ROCK_PAPER_SCISSORS: 132,
  ANNOUNCE_RACE: 140,
  ANNOUNCE_ATTRIB: 141,
  ANNOUNCE_CARD: 142,
  ANNOUNCE_NUMBER: 143,
} as const;

export const Res = {
  SELECT_BATTLECMD: 0,
  SELECT_IDLECMD: 1,
  SELECT_EFFECTYN: 2,
  SELECT_YESNO: 3,
  SELECT_OPTION: 4,
  SELECT_CARD: 5,
  SELECT_CARD_CODES: 6,
  SELECT_UNSELECT_CARD: 7,
  SELECT_CHAIN: 8,
  SELECT_DISFIELD: 9,
  SELECT_PLACE: 10,
  SELECT_POSITION: 11,
  SELECT_TRIBUTE: 12,
  SELECT_COUNTER: 13,
  SELECT_SUM: 14,
  SORT_CARD: 15,
  ANNOUNCE_RACE: 16,
  ANNOUNCE_ATTRIB: 17,
  ANNOUNCE_CARD: 18,
  ANNOUNCE_NUMBER: 19,
  ROCK_PAPER_SCISSORS: 20,
} as const;

export const IdleAction = { SUMMON: 0, SPECIAL_SUMMON: 1, POS_CHANGE: 2, MONSTER_SET: 3, SPELL_SET: 4, ACTIVATE: 5, TO_BP: 6, TO_EP: 7, SHUFFLE: 8 } as const;
export const BattleAction = { CHAIN: 0, ATTACK: 1, TO_M2: 2, TO_EP: 3 } as const;

export const Loc = { DECK: 1, HAND: 2, MZONE: 4, SZONE: 8, GRAVE: 16, REMOVED: 32, EXTRA: 64, OVERLAY: 128, FZONE: 256, PZONE: 512 } as const;

export const Pos = { FACEUP_ATTACK: 1, FACEDOWN_ATTACK: 2, FACEUP_DEFENSE: 4, FACEDOWN_DEFENSE: 8, FACEUP: 5, FACEDOWN: 10, ATTACK: 3, DEFENSE: 12 } as const;

export const Phase = { DRAW: 1, STANDBY: 2, MAIN1: 4, BATTLE_START: 8, BATTLE_STEP: 16, DAMAGE: 32, DAMAGE_CAL: 64, BATTLE: 128, MAIN2: 256, END: 512 } as const;

export const CardType = {
  MONSTER: 0x1,
  SPELL: 0x2,
  TRAP: 0x4,
  NORMAL: 0x10,
  EFFECT: 0x20,
  FUSION: 0x40,
  RITUAL: 0x80,
  TUNER: 0x1000,
  SYNCHRO: 0x2000,
  TOKEN: 0x4000,
  QUICKPLAY: 0x10000,
  CONTINUOUS: 0x20000,
  EQUIP: 0x40000,
  FIELD: 0x80000,
  COUNTER: 0x100000,
  FLIP: 0x200000,
  XYZ: 0x800000,
  PENDULUM: 0x1000000,
  LINK: 0x4000000,
} as const;

export const HintType = { EVENT: 1, MESSAGE: 2, SELECTMSG: 3, OPSELECTED: 4, EFFECT: 5, RACE: 6, ATTRIB: 7, CODE: 8, NUMBER: 9, CARD: 10, ZONE: 11 } as const;

/** System string ids of selection hints (HINTMSG_* in constant.lua). */
export const HintMsg = {
  RELEASE: 500,
  DISCARD: 501,
  DESTROY: 502,
  REMOVE: 503,
  TOGRAVE: 504,
  RTOHAND: 505,
  ATOHAND: 506,
  TODECK: 507,
  SUMMON: 508,
  SPSUMMON: 509,
  SET: 510,
  FMATERIAL: 511,
  SMATERIAL: 512,
  XMATERIAL: 513,
  EQUIP: 518,
  REMOVEXYZ: 519,
  CONTROL: 520,
  TRIBUTE: 531,
  LMATERIAL: 533,
  ATTACKTARGET: 549,
  TARGET: 551,
} as const;

/** Effect descriptions are packed as passcode * 16 + string index. */
export function splitDescription(description: number): { code: number; index: number } {
  return { code: Math.floor(description / 16), index: description % 16 };
}

export const isFaceUp = (position: number) => (position & Pos.FACEUP) !== 0;
export const isDefense = (position: number) => (position & Pos.DEFENSE) !== 0;

/** LP arrive as unsigned 32-bit values; negative LP wrap around. */
export function signedLp(lp: number): number {
  return lp > 0x7fffffff ? lp - 0x100000000 : lp;
}
