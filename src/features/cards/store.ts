import { create } from 'zustand';

import { getMeta } from '@/db/database';

import { countCards } from './repository';
import {
  META_BANLIST_AT,
  META_DB_VERSION,
  META_HAS_GERMAN,
  META_UPDATED_AT,
  syncCardDatabase,
  type SyncStatus,
} from './sync';

type CardDbState = {
  cardCount: number;
  version: string | null;
  updatedAt: number | null;
  banlistUpdatedAt: number | null;
  hasGerman: boolean;
  /** Incremented after every successful sync so screens can re-query. */
  revision: number;
  syncing: boolean;
  status: SyncStatus | null;
  lastError: string | null;
  lastMessage: string | null;
  refreshInfo: () => Promise<void>;
  sync: (force?: boolean) => Promise<void>;
};

export const useCardDb = create<CardDbState>((set, get) => ({
  cardCount: 0,
  version: null,
  updatedAt: null,
  banlistUpdatedAt: null,
  hasGerman: false,
  revision: 0,
  syncing: false,
  status: null,
  lastError: null,
  lastMessage: null,

  async refreshInfo() {
    const [cardCount, version, updatedAt, banlistAt, hasGerman] = await Promise.all([
      countCards(),
      getMeta(META_DB_VERSION),
      getMeta(META_UPDATED_AT),
      getMeta(META_BANLIST_AT),
      getMeta(META_HAS_GERMAN),
    ]);
    set({
      cardCount,
      version,
      updatedAt: updatedAt ? Number(updatedAt) : null,
      banlistUpdatedAt: banlistAt ? Number(banlistAt) : null,
      hasGerman: hasGerman === '1',
    });
  },

  async sync(force = false) {
    if (get().syncing) return;
    set({ syncing: true, lastError: null, lastMessage: null, status: null });
    try {
      const result = await syncCardDatabase({ force }, (status) => set({ status }));
      await get().refreshInfo();
      const message = result.updated
        ? `${result.cardCount} Karten geladen (Version ${result.version}).`
        : 'Kartendaten waren bereits aktuell, Banlist wurde aktualisiert.';
      set((state) => ({
        revision: state.revision + 1,
        lastMessage: [message, ...result.warnings].join('\n'),
      }));
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ syncing: false, status: null });
    }
  },
}));
