import { create } from 'zustand';

import type { Card } from '@/features/cards/types';

import { moveStarter, toggleTag, type MetaChange } from './metaOps';
import { loadDeckMeta, saveCardMeta } from './repository';
import { EMPTY_META, suggestedTags, type DeckMeta, type HandTag } from './tags';

type DeckMetaState = {
  byDeck: Record<string, DeckMeta>;
  load: (deckId: string) => Promise<void>;
  toggleTag: (deckId: string, cardId: number, tag: HandTag) => Promise<void>;
  moveStarter: (deckId: string, ordered: number[], cardId: number, delta: -1 | 1) => Promise<void>;
  /** Tags well-known hand traps / board breakers that are still untagged. Returns how many cards changed. */
  applySuggestions: (deckId: string, cards: Card[]) => Promise<number>;
};

export const useDeckMeta = create<DeckMetaState>((set, get) => {
  const commit = async (deckId: string, change: MetaChange) => {
    set((s) => ({ byDeck: { ...s.byDeck, [deckId]: change.meta } }));
    for (const cardId of change.changed) await saveCardMeta(deckId, cardId, change.meta[cardId] ?? EMPTY_META);
  };
  const metaOf = (deckId: string) => get().byDeck[deckId] ?? {};

  return {
    byDeck: {},

    async load(deckId) {
      const meta = await loadDeckMeta(deckId);
      set((s) => ({ byDeck: { ...s.byDeck, [deckId]: meta } }));
    },

    toggleTag: (deckId, cardId, tag) => commit(deckId, toggleTag(metaOf(deckId), cardId, tag)),

    moveStarter: (deckId, ordered, cardId, delta) => commit(deckId, moveStarter(metaOf(deckId), ordered, cardId, delta)),

    async applySuggestions(deckId, cards) {
      let meta = metaOf(deckId);
      const changed = new Set<number>();
      for (const card of cards) {
        if ((meta[card.id]?.tags.length ?? 0) > 0) continue;
        for (const tag of suggestedTags(card.nameEn)) {
          const result = toggleTag(meta, card.id, tag);
          meta = result.meta;
          result.changed.forEach((id) => changed.add(id));
        }
      }
      if (changed.size > 0) await commit(deckId, { meta, changed: [...changed] });
      return changed.size;
    },
  };
});

