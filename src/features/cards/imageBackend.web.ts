import type { ImageSize } from './types';

/**
 * Web image storage using the Cache Storage API. Cached images are exposed as
 * blob: object URLs. If the image host does not allow CORS reads, the remote
 * URL is used and the browser's HTTP cache takes over.
 */
const CACHE_NAME = 'card-images-v1';

const objectUrls = new Map<string, string>();
const keyOf = (imageId: number, size: ImageSize) => `${size}:${imageId}`;
const cacheKey = (imageId: number, size: ImageSize) => `/card-images/${size}/${imageId}.jpg`;

function hasCacheStorage(): boolean {
  return typeof caches !== 'undefined';
}

async function toObjectUrl(key: string, response: Response): Promise<string> {
  const url = URL.createObjectURL(await response.blob());
  objectUrls.set(key, url);
  return url;
}

export const imageBackend = {
  peek(imageId: number, size: ImageSize): string | null {
    return objectUrls.get(keyOf(imageId, size)) ?? null;
  },

  async lookup(imageId: number, size: ImageSize): Promise<string | null> {
    const key = keyOf(imageId, size);
    const known = objectUrls.get(key);
    if (known) return known;
    if (!hasCacheStorage()) return null;
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKey(imageId, size));
    return hit ? toObjectUrl(key, hit) : null;
  },

  async download(url: string, imageId: number, size: ImageSize): Promise<string> {
    const key = keyOf(imageId, size);
    if (!hasCacheStorage()) return url;
    let response: Response;
    try {
      response = await fetch(url, { mode: 'cors' });
    } catch {
      // CORS not allowed or offline: let the <img> element load it directly.
      return url;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey(imageId, size), response.clone());
    return toObjectUrl(key, response);
  },

  async stats(): Promise<{ count: number; bytes: number | null }> {
    if (!hasCacheStorage()) return { count: 0, bytes: null };
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let bytes: number | null = null;
    try {
      const estimate = await navigator.storage?.estimate?.();
      bytes = estimate?.usage ?? null;
    } catch {
      bytes = null;
    }
    return { count: keys.length, bytes };
  },

  async clear(): Promise<void> {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    objectUrls.clear();
    if (hasCacheStorage()) await caches.delete(CACHE_NAME);
  },
};
