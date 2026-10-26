import { getMeta, setMeta } from '@/db/database';

import { fetchAllCards, fetchBanlist, fetchDbVersion, type ApiCard } from './api';
import type { DownloadProgress } from './download';
import { mapApiCard } from './mapping';
import { countCards, replaceAllCards, replaceBanlist } from './repository';
import type { Card } from './types';

export type SyncPhase = 'checking' | 'download-en' | 'download-de' | 'saving' | 'banlist';

export type SyncStatus = {
  phase: SyncPhase;
  message: string;
  /** 0..1, or null when the size is unknown. */
  progress: number | null;
};

export type SyncResult = {
  updated: boolean;
  cardCount: number;
  version: string | null;
  warnings: string[];
};

export const META_DB_VERSION = 'cards.db_version';
export const META_UPDATED_AT = 'cards.updated_at';
export const META_BANLIST_AT = 'cards.banlist_updated_at';
export const META_HAS_GERMAN = 'cards.has_german';

function progressOf(p: DownloadProgress): number | null {
  return p.total ? Math.min(1, p.received / p.total) : null;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Joins English and German API entries into app cards. */
export function mergeLanguages(english: ApiCard[], german: ApiCard[] | null): Card[] {
  const germanById = new Map<number, ApiCard>();
  for (const card of german ?? []) germanById.set(card.id, card);
  return english.map((card) => mapApiCard(card, germanById.get(card.id)));
}

/**
 * Downloads the card database (English + German) if YGOPRODeck has a newer
 * version, otherwise only refreshes the TCG/OCG banlists.
 */
export async function syncCardDatabase(
  options: { force?: boolean },
  onStatus: (status: SyncStatus) => void
): Promise<SyncResult> {
  const warnings: string[] = [];

  onStatus({ phase: 'checking', message: 'Prüfe Datenbank-Version …', progress: null });
  const [remote, storedVersion, existingCount] = await Promise.all([
    fetchDbVersion(),
    getMeta(META_DB_VERSION),
    countCards(),
  ]);

  const upToDate = !options.force && existingCount > 0 && storedVersion === remote.database_version;

  if (upToDate) {
    onStatus({ phase: 'banlist', message: 'Kartendaten sind aktuell. Lade aktuelle Banlist …', progress: null });
    const [tcg, ocg] = await Promise.all([fetchBanlist('tcg'), fetchBanlist('ocg')]);
    await replaceBanlist('tcg', tcg.map((c) => ({ id: c.id, status: c.banlist_info?.ban_tcg })));
    await replaceBanlist('ocg', ocg.map((c) => ({ id: c.id, status: c.banlist_info?.ban_ocg })));
    await setMeta(META_BANLIST_AT, String(Date.now()));
    return { updated: false, cardCount: existingCount, version: storedVersion, warnings };
  }

  onStatus({ phase: 'download-en', message: 'Lade Kartendaten (Englisch) …', progress: 0 });
  const english = await fetchAllCards('en', (p) =>
    onStatus({
      phase: 'download-en',
      message: `Lade Kartendaten (Englisch) … ${mb(p.received)}`,
      progress: progressOf(p),
    })
  );

  let german: ApiCard[] | null = null;
  onStatus({ phase: 'download-de', message: 'Lade deutsche Kartentexte …', progress: 0 });
  try {
    german = await fetchAllCards('de', (p) =>
      onStatus({
        phase: 'download-de',
        message: `Lade deutsche Kartentexte … ${mb(p.received)}`,
        progress: progressOf(p),
      })
    );
  } catch (error) {
    warnings.push(
      `Deutsche Kartentexte konnten nicht geladen werden, es wird Englisch verwendet. (${error instanceof Error ? error.message : String(error)})`
    );
  }

  const cards = mergeLanguages(english, german);
  onStatus({ phase: 'saving', message: `Speichere ${cards.length} Karten …`, progress: 0 });
  await replaceAllCards(cards, (done, total) =>
    onStatus({ phase: 'saving', message: `Speichere Karten … ${done}/${total}`, progress: done / total })
  );

  const now = String(Date.now());
  await setMeta(META_DB_VERSION, remote.database_version);
  await setMeta(META_UPDATED_AT, now);
  await setMeta(META_BANLIST_AT, now);
  await setMeta(META_HAS_GERMAN, german ? '1' : '0');

  return { updated: true, cardCount: cards.length, version: remote.database_version, warnings };
}
