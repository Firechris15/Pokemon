export type DeckSection = 'main' | 'extra' | 'side';

export const DECK_SECTIONS: DeckSection[] = ['main', 'extra', 'side'];

export const SECTION_LABELS: Record<DeckSection, string> = {
  main: 'Main Deck',
  extra: 'Extra Deck',
  side: 'Side Deck',
};

export type DeckCards = Record<DeckSection, number[]>;

export type Deck = DeckCards & {
  id: string;
  name: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
};

export type DeckSummary = {
  id: string;
  name: string;
  mainCount: number;
  extraCount: number;
  sideCount: number;
  /** First card of the main deck, used as cover art. */
  coverId: number | null;
  updatedAt: number;
};

export const DECK_LIMITS = {
  mainMin: 40,
  mainMax: 60,
  extraMax: 15,
  sideMax: 15,
  copies: 3,
} as const;
