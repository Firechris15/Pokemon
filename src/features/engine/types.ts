/**
 * Serializable types shared by the app, the engine worker and the AI.
 * Engine values that are 64-bit in ocgcore (descriptions, races, flags)
 * are plain numbers here; they all fit into a double.
 */

export type Player = 0 | 1;

/** Card data the rules engine needs (from EDOPro's cards.cdb). */
export type EngineCard = {
  code: number;
  alias: number;
  setcodes: number[];
  type: number;
  level: number;
  attribute: number;
  race: number;
  attack: number;
  defense: number;
  lscale: number;
  rscale: number;
  linkMarker: number;
};

export type AiLevel = 1 | 2;

export type DuelPlayerConfig = {
  name: string;
  lp: number;
  main: number[];
  extra: number[];
  startHand: number;
  drawPerTurn: number;
  /** Played by the AI in the worker; null = asks the app. */
  ai: AiLevel | null;
  /** Puzzles: the AI uses responses at the first opportunity. */
  eager?: boolean;
};

export type DuelConfig = {
  /** Xoshiro256** seed (4 × 64 bit) as decimal strings. */
  seed: [string, string, string, string];
  /** Engine player 0 takes the first turn. */
  players: [DuelPlayerConfig, DuelPlayerConfig];
  /** Lua puzzle script that sets up the field instead of decks. */
  puzzle?: string;
};

/** An engine message with bigints converted to numbers. */
export type EngineMessage = { type: number } & Record<string, unknown>;

export type CardLoc = { code: number; controller: Player; location: number; sequence: number };
export type CardLocPos = CardLoc & { position: number; overlay_sequence?: number };
export type CardLocActive = CardLoc & { description: number; client_mode?: number };
export type CardLocPosActive = CardLocPos & { description: number; client_mode?: number };

export type SelectIdleCmd = {
  type: 11;
  player: Player;
  summons: CardLoc[];
  special_summons: CardLoc[];
  pos_changes: CardLoc[];
  monster_sets: CardLoc[];
  spell_sets: CardLoc[];
  activates: CardLocActive[];
  to_bp: boolean;
  to_ep: boolean;
  shuffle: boolean;
};
export type SelectBattleCmd = {
  type: 10;
  player: Player;
  chains: CardLocActive[];
  attacks: (CardLoc & { can_direct: boolean })[];
  to_m2: boolean;
  to_ep: boolean;
};
export type SelectCard = { type: 15; player: Player; can_cancel: boolean; min: number; max: number; selects: CardLocPos[] };
export type SelectTribute = { type: 20; player: Player; can_cancel: boolean; min: number; max: number; selects: (CardLoc & { release_param: number })[] };
export type SelectUnselectCard = {
  type: 26;
  player: Player;
  can_finish: boolean;
  can_cancel: boolean;
  min: number;
  max: number;
  select_cards: CardLocPos[];
  unselect_cards: CardLocPos[];
};
export type SelectSum = { type: 23; player: Player; select_max: number; amount: number; min: number; max: number; selects_must: (CardLoc & { amount: number })[]; selects: (CardLoc & { amount: number })[] };
export type SelectChain = { type: 16; player: Player; spe_count: number; forced: boolean; hint_timing: number; hint_timing_other: number; selects: CardLocPosActive[] };
export type SelectEffectYn = { type: 12; player: Player; code: number; controller: Player; location: number; sequence: number; position: number; description: number };
export type SelectYesNo = { type: 13; player: Player; description: number };
export type SelectOption = { type: 14; player: Player; options: number[] };
export type SelectPlace = { type: 18 | 24; player: Player; count: number; field_mask: number };
export type SelectPosition = { type: 19; player: Player; code: number; positions: number };
export type SelectCounter = { type: 22; player: Player; counter_type: number; count: number; cards: (CardLoc & { count: number })[] };
export type SortCards = { type: 21 | 25; player: Player; cards: CardLoc[] };
export type AnnounceRace = { type: 140; player: Player; count: number; available: number };
export type AnnounceAttrib = { type: 141; player: Player; count: number; available: number };
export type AnnounceCard = { type: 142; player: Player; opcodes: number[] };
export type AnnounceNumber = { type: 143; player: Player; options: number[] };
export type RockPaperScissors = { type: 132; player: Player };

export type SelectRequest =
  | SelectIdleCmd
  | SelectBattleCmd
  | SelectCard
  | SelectTribute
  | SelectUnselectCard
  | SelectSum
  | SelectChain
  | SelectEffectYn
  | SelectYesNo
  | SelectOption
  | SelectPlace
  | SelectPosition
  | SelectCounter
  | SortCards
  | AnnounceRace
  | AnnounceAttrib
  | AnnounceCard
  | AnnounceNumber
  | RockPaperScissors;

export type FieldPlace = { player: Player; location: number; sequence: number };

/** Responses as plain JSON (they are stored in replays). */
export type EngineResponse =
  | { type: 0; action: number; index: number | null }
  | { type: 1; action: number; index: number | null }
  | { type: 2 | 3; yes: boolean }
  | { type: 4; index: number }
  | { type: 5 | 12; indicies: number[] | null }
  | { type: 6; codes: number[] | null }
  | { type: 7; index: number | null }
  | { type: 8; index: number | null }
  | { type: 9 | 10; places: FieldPlace[] }
  | { type: 11; position: number }
  | { type: 13; counters: number[] }
  | { type: 14; indicies: number[] }
  | { type: 15; order: number[] | null }
  | { type: 16; races: number[] }
  | { type: 17; attributes: number[] }
  | { type: 18; card: number }
  | { type: 19; value: number }
  | { type: 20; value: 1 | 2 | 3 };

/** A select request for one player, with the hint shown before it. */
export type Prompt = { request: SelectRequest; hint: number | null; retry: boolean };

export type CardView = {
  /** 0 = unknown to the viewer. */
  code: number;
  controller: Player;
  owner: Player;
  location: number;
  sequence: number;
  position: number;
  type: number;
  attack: number | null;
  defense: number | null;
  baseAttack: number | null;
  baseDefense: number | null;
  /** Xyz material passcodes (0 = unknown). */
  materials: number[];
  isPublic: boolean;
  /** Revealed snapshot (replays): the viewer could not see this card during the duel. */
  hidden?: boolean;
};

export type PlayerView = {
  lp: number;
  hand: CardView[];
  /** 7 entries: Main Monster Zones 0–4, Extra Monster Zones 5–6. */
  mzone: (CardView | null)[];
  /** 8 entries: Spell & Trap Zones 0–4, Field Zone 5, Pendulum Zones 6–7. */
  szone: (CardView | null)[];
  grave: CardView[];
  removed: CardView[];
  extra: CardView[];
  deckCount: number;
};

export type ChainLinkView = { code: number; controller: Player; location: number; sequence: number; description: number };

export type Snapshot = {
  viewer: Player;
  players: [PlayerView, PlayerView];
  turn: number;
  turnPlayer: Player;
  phase: number;
  chain: ChainLinkView[];
};

/** Compact duel log; secret entries are hidden from the other player. */
export type LogEntry =
  | { k: 'turn'; turn: number; player: Player }
  | { k: 'phase'; player: Player; phase: number }
  | { k: 'draw'; player: Player; codes: number[] }
  | { k: 'summon' | 'spsummon' | 'flipsummon' | 'set'; player: Player; code: number; location: number; secret?: boolean }
  | { k: 'activate'; player: Player; code: number; location: number; description: number; chain: number }
  | { k: 'negated'; chain: number }
  | { k: 'resolved'; chain: number }
  | { k: 'attack'; player: Player; code: number; target: number | null }
  | { k: 'damage' | 'recover' | 'cost'; player: Player; amount: number }
  | { k: 'lp'; player: Player; lp: number }
  | { k: 'move'; player: Player; code: number; from: number; to: number; toPlayer: Player; secret?: boolean }
  | { k: 'coin'; player: Player; results: boolean[] }
  | { k: 'dice'; player: Player; results: number[] }
  | { k: 'win'; player: Player; reason: number };

export type DuelResult = { winner: Player | null; reason: string };

/** Everything needed to replay a duel exactly. */
export type ReplayData = {
  config: DuelConfig;
  responses: EngineResponse[];
  log: LogEntry[];
  result: DuelResult;
  turns: number;
};

// ---- Replays and analysis ----------------------------------------------------------

/** One step of a replay; the snapshot itself is fetched from the engine on demand. */
export type FrameMeta = {
  turn: number;
  turnPlayer: Player;
  phase: number;
  /** LP of player 0 and 1. */
  lp: [number, number];
  /** Number of log entries that happened up to this frame. */
  logEnd: number;
  /** Index of the next response (= decisions taken so far). */
  response: number;
};

/** Compact view of one side of the field for analysis prompts. */
export type BoardSide = {
  lp: number;
  /** Hand passcodes, 0 = unknown to the viewer. */
  hand: number[];
  deck: number;
  monsters: { code: number; zone: number; position: number; attack: number | null; defense: number | null; materials: number }[];
  spells: { code: number; zone: number; faceUp: boolean }[];
  grave: number[];
  banished: number[];
  extra: number;
};

/** The field from the viewer's side when a decision was taken. */
export type BoardSummary = { turn: number; myTurn: boolean; phase: number; me: BoardSide; opp: BoardSide; chain: { code: number; mine: boolean }[] };

/** A decision the app user took in a replay. */
export type DecisionPoint = {
  /** Index into the replay's responses. */
  index: number;
  /** Frame showing the field at this decision. */
  frame: number;
  request: SelectRequest;
  hint: number | null;
  response: EngineResponse;
  board: BoardSummary;
};

export type ReplayInfo = {
  frames: FrameMeta[];
  decisions: DecisionPoint[];
  /** Response index where the engine no longer accepts the recorded duel (card scripts changed); null = complete. */
  diverged: number | null;
};

/** An alternative move to check: answer `response` at the decision with this response index. */
export type Suggestion = { decision: number; response: EngineResponse };

/** Result of a line from the viewer's side: [me, opponent]. */
export type Outcome = { lp: [number, number]; field: [number, number]; hand: [number, number]; winner: 'me' | 'opp' | null; score: number };

export type SuggestionCheck =
  | { status: 'illegal' }
  | { status: 'unknown'; reason: string }
  | { status: 'ok'; turn: number; actual: Outcome; alternative: Outcome };

/** Engine review of one decision: the chosen answer and the best alternative, both played on by the level 1 AI. */
export type ReviewVerdict = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export type DecisionReview = {
  /** Index into the replay's responses (matches DecisionPoint.index). */
  index: number;
  frame: number;
  turn: number;
  verdict: ReviewVerdict;
  /** Evaluation lost against the best option (0 … 1). */
  loss: number;
  /** Options played through (including the chosen one). */
  compared: number;
  chosen: { response: EngineResponse; outcome: Outcome };
  /** Clearly better alternative (only for inaccuracies, mistakes and blunders). */
  best: { response: EngineResponse; outcome: Outcome } | null;
};

export type ReplayReview = {
  version: 1;
  createdAt: number;
  decisions: DecisionReview[];
  counts: Record<ReviewVerdict, number>;
  /** 0 … 100 */
  accuracy: number;
  diverged: number | null;
};

// ---- Worker protocol -------------------------------------------------------------

export type ToEngine =
  | { t: 'init'; cards: EngineCard[]; scripts: [string, string][] }
  | { t: 'scripts'; scripts: [string, string][] }
  | { t: 'start'; config: DuelConfig; viewer: Player; aiThinkMs?: number }
  | { t: 'respond'; response: EngineResponse }
  | { t: 'surrender' }
  | { t: 'stop' }
  | { t: 'replay'; id: string; config: DuelConfig; responses: EngineResponse[]; viewer: Player }
  | { t: 'frame'; id: string; index: number }
  | { t: 'verify'; id: string; suggestions: Suggestion[] }
  | { t: 'review'; id: string }
  | { t: 'closeReplay' };

export type FromEngine =
  | { t: 'ready' }
  | {
      t: 'update';
      snapshot: Snapshot;
      log: LogEntry[];
      prompt: Prompt | null;
      /** The AI is computing its move. */
      thinking: boolean;
      missingScripts: string[];
    }
  | { t: 'end'; snapshot: Snapshot; replay: ReplayData }
  | { t: 'error'; message: string }
  | { t: 'replayInfo'; id: string; info: ReplayInfo }
  /** Revealed snapshot (hidden cards marked) of one replay frame. */
  | { t: 'frame'; id: string; index: number; snapshot: Snapshot }
  | { t: 'verified'; id: string; results: SuggestionCheck[] }
  | { t: 'reviewProgress'; id: string; done: number; total: number }
  | { t: 'reviewed'; id: string; review: ReplayReview }
  | { t: 'replayError'; id: string; message: string };
