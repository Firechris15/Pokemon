import type { ComponentType } from 'react';
import { create } from 'zustand';

import type { Card } from './types';

export type CardActionsComponent = ComponentType<{ card: Card }>;

type CardDetailState = {
  cardId: number | null;
  /** Cards the user can page through with swipes / arrows. */
  sequence: number[];
  /** Context specific actions (e.g. "add to deck"), rendered in the detail view. */
  Actions: CardActionsComponent | null;
  open: (cardId: number, options?: { sequence?: number[]; actions?: CardActionsComponent }) => void;
  close: () => void;
  step: (delta: number) => void;
};

export const useCardDetail = create<CardDetailState>((set, get) => ({
  cardId: null,
  sequence: [],
  Actions: null,
  open(cardId, options) {
    set({ cardId, sequence: options?.sequence ?? [], Actions: options?.actions ?? null });
  },
  close() {
    set({ cardId: null, sequence: [], Actions: null });
  },
  step(delta) {
    const { cardId, sequence } = get();
    if (cardId === null || sequence.length < 2) return;
    const index = sequence.indexOf(cardId);
    const next = sequence[(index + delta + sequence.length) % sequence.length];
    if (next !== undefined) set({ cardId: next });
  },
}));

export function openCardDetail(cardId: number, options?: Parameters<CardDetailState['open']>[1]): void {
  useCardDetail.getState().open(cardId, options);
}
