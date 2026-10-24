export type ComboAction =
  | 'normal_summon'
  | 'special_summon'
  | 'set'
  | 'activate'
  | 'search'
  | 'send_gy'
  | 'banish'
  | 'link_summon'
  | 'xyz_summon'
  | 'synchro_summon'
  | 'fusion_summon'
  | 'ritual_summon'
  | 'draw'
  | 'attach'
  | 'return_hand'
  | 'other';

/** Where a card ends up after a step. "deck"/"extra" means it leaves the tracked zones. */
export type Zone = 'hand' | 'field' | 'gy' | 'banished' | 'material' | 'deck' | 'extra';

export type ComboStep = {
  id: string;
  /** The card that is summoned / activated / acts. */
  cardId: number;
  action: ComboAction;
  /** Related cards: searched card, materials, tributes, targets … */
  targets: number[];
  /** Zone of the main card afterwards (null = stays where it is). */
  cardTo: Zone | null;
  /** Zone of the related cards afterwards (null = they do not move). */
  targetsTo: Zone | null;
  /** Explanation shown after answering in the quiz. */
  note: string;
};

export type Combo = {
  id: string;
  name: string;
  deckId: string | null;
  startingHand: number[];
  steps: ComboStep[];
  endBoard: number[];
  notes: string;
  createdAt: number;
  updatedAt: number;
};

/** Spaced repetition state per combo (SM-2). */
export type ComboReview = {
  comboId: string;
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: number;
  lastReviewedAt: number | null;
  /** Wrong answers per step id, to show which steps are hard. */
  stepErrors: Record<string, number>;
};

export type QuizMode = 'choice' | 'free';
