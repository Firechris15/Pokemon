import { ygoprodeckLimiter } from '@/lib/rateLimiter';

import { downloadJson, type DownloadProgress } from './download';
import type { ImageSize } from './types';

/**
 * Client for the public YGOPRODeck API (https://ygoprodeck.com/api-guide/).
 *
 * API guidelines this client follows:
 * - Card data is downloaded in bulk once and stored locally; the API is only
 *   called again when the user presses "Update".
 * - checkDBVer.php is used to skip downloads when nothing changed.
 * - All requests go through a shared rate limiter (limit is 20 req/s).
 * - Card images are downloaded once and served from the local cache.
 */
export const API_BASE = 'https://db.ygoprodeck.com/api/v7';
export const IMAGE_BASE = 'https://images.ygoprodeck.com/images';

export type ApiBanlistInfo = {
  ban_tcg?: string;
  ban_ocg?: string;
  ban_goat?: string;
};

export type ApiCardImage = {
  id: number;
  image_url?: string;
  image_url_small?: string;
  image_url_cropped?: string;
};

export type ApiCard = {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  race?: string;
  attribute?: string;
  level?: number;
  linkval?: number;
  linkmarkers?: string[];
  scale?: number;
  atk?: number | null;
  def?: number | null;
  archetype?: string;
  typeline?: string[];
  banlist_info?: ApiBanlistInfo;
  card_images?: ApiCardImage[];
};

export type ApiCardResponse = { data: ApiCard[] };

export type ApiDbVersion = { database_version: string; last_update: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson<T>(url: string): Promise<T> {
  await ygoprodeckLimiter.acquire();
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiError('Keine Verbindung zu YGOPRODeck. Bitte Internetverbindung prüfen.');
  }
  if (!response.ok) {
    throw new ApiError(`YGOPRODeck antwortete mit Status ${response.status}.`, response.status);
  }
  return (await response.json()) as T;
}

export async function fetchDbVersion(): Promise<ApiDbVersion> {
  const result = await getJson<ApiDbVersion[] | ApiDbVersion>(`${API_BASE}/checkDBVer.php`);
  const entry = Array.isArray(result) ? result[0] : result;
  if (!entry?.database_version) throw new ApiError('Unerwartete Antwort von checkDBVer.php.');
  return entry;
}

/** Downloads every card. `language` = "de" returns German names and texts. */
export async function fetchAllCards(
  language: 'en' | 'de',
  onProgress?: (progress: DownloadProgress) => void
): Promise<ApiCard[]> {
  const url = language === 'en' ? `${API_BASE}/cardinfo.php` : `${API_BASE}/cardinfo.php?language=${language}`;
  await ygoprodeckLimiter.acquire();
  const result = (await downloadJson(url, onProgress)) as ApiCardResponse;
  if (!result || !Array.isArray(result.data)) {
    throw new ApiError('Unerwartete Antwort von cardinfo.php.');
  }
  return result.data;
}

/** Cards on the given banlist (small request, used for banlist-only refreshes). */
export async function fetchBanlist(format: 'tcg' | 'ocg'): Promise<ApiCard[]> {
  try {
    const result = await getJson<ApiCardResponse>(`${API_BASE}/cardinfo.php?banlist=${format}`);
    return result.data ?? [];
  } catch (error) {
    // The API answers 400 when a query has no results.
    if (error instanceof ApiError && error.status === 400) return [];
    throw error;
  }
}

export function imageUrl(imageId: number, size: ImageSize): string {
  const folder = size === 'small' ? 'cards_small' : 'cards';
  return `${IMAGE_BASE}/${folder}/${imageId}.jpg`;
}
