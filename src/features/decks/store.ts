import { create } from 'zustand';

import * as repo from './repository';
import type { Deck, DeckCards, DeckSection } from './types';

type DecksState = {
  decks: Deck[];
  loaded: boolean;
  load: () => Promise<void>;
  create: (name: string, cards?: Partial<DeckCards>) => Promise<Deck>;
  duplicate: (id: string) => Promise<Deck | null>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  /** Replaces a deck's contents (used by the editor). Persists immediately. */
  update: (id: string, patch: Partial<Omit<Deck, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  addCard: (id: string, cardId: number, section: DeckSection) => Promise<void>;
  removeCard: (id: string, cardId: number, section: DeckSection) => Promise<void>;
  moveCard: (id: string, cardId: number, from: DeckSection, to: DeckSection) => Promise<void>;
};

/** Writes are serialized so quick taps never overwrite each other. */
let writeChain: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = writeChain.then(task, task);
  writeChain = next.catch(() => undefined);
  return next;
}

export const useDecks = create<DecksState>((set, get) => {
  const replaceLocal = (deck: Deck) =>
    set((s) => ({ decks: [deck, ...s.decks.filter((d) => d.id !== deck.id)] }));

  const mutate = (id: string, change: (deck: Deck) => Deck | null) =>
    serialized(async () => {
      const current = get().decks.find((d) => d.id === id);
      if (!current) return;
      const changed = change(current);
      if (!changed) return;
      // Optimistic update first so the UI reacts instantly.
      replaceLocal(changed);
      replaceLocal(await repo.saveDeck(changed));
    });

  return {
    decks: [],
    loaded: false,

    async load() {
      const decks = await repo.listDecks();
      set({ decks, loaded: true });
    },

    async create(name, cards) {
      const deck = await serialized(() => repo.createDeck(name, cards));
      replaceLocal(deck);
      return deck;
    },

    async duplicate(id) {
      const copy = await serialized(() => repo.duplicateDeck(id));
      if (copy) replaceLocal(copy);
      return copy;
    },

    async remove(id) {
      await serialized(() => repo.deleteDeck(id));
      set((s) => ({ decks: s.decks.filter((d) => d.id !== id) }));
    },

    rename: (id, name) => mutate(id, (deck) => ({ ...deck, name })),

    update: (id, patch) => mutate(id, (deck) => ({ ...deck, ...patch })),

    addCard: (id, cardId, section) => mutate(id, (deck) => ({ ...deck, [section]: [...deck[section], cardId] })),

    removeCard: (id, cardId, section) =>
      mutate(id, (deck) => {
        const index = deck[section].lastIndexOf(cardId);
        if (index < 0) return null;
        const list = [...deck[section]];
        list.splice(index, 1);
        return { ...deck, [section]: list };
      }),

    moveCard: (id, cardId, from, to) =>
      mutate(id, (deck) => {
        const index = deck[from].lastIndexOf(cardId);
        if (index < 0 || from === to) return null;
        const source = [...deck[from]];
        source.splice(index, 1);
        return { ...deck, [from]: source, [to]: [...deck[to], cardId] };
      }),
  };
});

export function useDeck(id: string | undefined): Deck | undefined {
  return useDecks((s) => s.decks.find((d) => d.id === id));
}
