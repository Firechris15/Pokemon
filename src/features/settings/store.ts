import { create } from 'zustand';

import { getDb } from '@/db/database';
import type { BanlistFormat } from '@/features/cards/types';

export type Settings = {
  /** Banlist used for deck validation and search. */
  banlist: BanlistFormat;
  /** Preferred language for card names and texts (German falls back to English). */
  language: 'de' | 'en';
  /** Download full-size images of every card in a deck when the deck is opened. */
  prefetchDeckImages: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  banlist: 'tcg',
  language: 'de',
  prefetchDeckImages: true,
};

type SettingsState = Settings & {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
};

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  async load() {
    const db = await getDb();
    const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
    const stored: Partial<Settings> = {};
    for (const { key, value } of rows) {
      if (key in DEFAULT_SETTINGS) {
        try {
          (stored as Record<string, unknown>)[key] = JSON.parse(value);
        } catch {
          // Ignore corrupt values and keep the default.
        }
      }
    }
    set({ ...DEFAULT_SETTINGS, ...stored, loaded: true });
  },

  async update(patch) {
    set(patch);
    const db = await getDb();
    for (const [key, value] of Object.entries(patch)) {
      await db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        JSON.stringify(value)
      );
    }
    if (get().loaded === false) set({ loaded: true });
  },
}));
