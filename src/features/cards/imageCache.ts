import { useCallback, useSyncExternalStore } from 'react';
import { create } from 'zustand';

import { JobQueue, ygoprodeckLimiter } from '@/lib/rateLimiter';

import { imageUrl } from './api';
import { imageBackend } from './imageBackend';
import type { ImageSize } from './types';

/**
 * Local card image cache.
 *
 * Every image is downloaded from YGOPRODeck at most once (rate limited) and
 * then always served from local storage, so the app works offline and does
 * not hotlink. The storage backend is platform specific (file system on
 * iOS/Android, Cache Storage on web), see imageBackend.ts / .web.ts.
 */

const RETRY_AFTER_MS = 60_000;
const PRIORITY_VISIBLE = 1;
const PRIORITY_PREFETCH = 0;

const uris = new Map<string, string>();
/** Keys already looked up synchronously and not found (avoids repeated disk checks). */
const missing = new Set<string>();
const failedAt = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
const queue = new JobQueue(4);

const keyOf = (imageId: number, size: ImageSize) => `${size}:${imageId}`;

function emit(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

function subscribe(key: string, listener: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(key);
  };
}

/** Returns the local URI if the image is already cached (synchronous). */
export function peekImage(imageId: number, size: ImageSize): string | null {
  const key = keyOf(imageId, size);
  const known = uris.get(key);
  if (known) return known;
  if (missing.has(key)) return null;
  const local = imageBackend.peek(imageId, size);
  if (local) uris.set(key, local);
  else missing.add(key);
  return local;
}

async function load(imageId: number, size: ImageSize, key: string): Promise<boolean> {
  try {
    const local = await imageBackend.lookup(imageId, size);
    if (local) {
      uris.set(key, local);
      return true;
    }
    await ygoprodeckLimiter.acquire();
    const uri = await imageBackend.download(imageUrl(imageId, size), imageId, size);
    uris.set(key, uri);
    failedAt.delete(key);
    return true;
  } catch {
    failedAt.set(key, Date.now());
    return false;
  } finally {
    emit(key);
  }
}

/** Makes sure the image is (being) cached. Returns true if it is already available. */
export function requestImage(imageId: number, size: ImageSize, priority = PRIORITY_VISIBLE): boolean {
  if (peekImage(imageId, size)) return true;
  const key = keyOf(imageId, size);
  const failed = failedAt.get(key);
  if (failed && Date.now() - failed < RETRY_AFTER_MS) return false;
  queue.enqueue(key, () => load(imageId, size, key).then(() => undefined), priority);
  return false;
}

/** Drops a queued (not yet running) request, e.g. when a card scrolls off screen. */
export function cancelImage(imageId: number, size: ImageSize): void {
  queue.cancel(keyOf(imageId, size));
}

/** React hook: local URI of a card image, downloading it on first use. */
export function useCardImage(imageId: number | null, size: ImageSize): { uri: string | null; failed: boolean } {
  const key = imageId === null ? '' : keyOf(imageId, size);
  const subscribeUri = useCallback(
    (listener: () => void) => (imageId === null ? () => undefined : subscribeAndRequest(imageId, size, key, listener)),
    [imageId, size, key]
  );
  const subscribeFailed = useCallback(
    (listener: () => void) => (imageId === null ? () => undefined : subscribe(key, listener)),
    [imageId, key]
  );
  const uri = useSyncExternalStore(
    subscribeUri,
    () => (imageId === null ? null : peekImage(imageId, size)),
    () => null
  );
  const failed = useSyncExternalStore(
    subscribeFailed,
    () => (imageId === null ? false : !uris.has(key) && failedAt.has(key)),
    () => false
  );
  return { uri, failed };
}

function subscribeAndRequest(imageId: number, size: ImageSize, key: string, listener: () => void) {
  const unsubscribe = subscribe(key, listener);
  requestImage(imageId, size);
  return () => {
    unsubscribe();
    if (!listeners.has(key)) cancelImage(imageId, size);
  };
}

// ---------------------------------------------------------------------------
// Bulk downloads (offline preparation)

type BulkState = {
  running: boolean;
  label: string;
  total: number;
  done: number;
  failed: number;
};

export const useImageBulk = create<BulkState>(() => ({ running: false, label: '', total: 0, done: 0, failed: 0 }));

let bulkToken = 0;

/**
 * Downloads many images in the background with low priority (visible cards
 * still go first). Already cached images are skipped quickly.
 */
export async function downloadImagesInBackground(imageIds: number[], size: ImageSize, label: string): Promise<void> {
  const token = ++bulkToken;
  const todo = [...new Set(imageIds)].filter((id) => !peekImage(id, size));
  useImageBulk.setState({ running: true, label, total: todo.length, done: 0, failed: 0 });

  // Feed the queue in small batches so cancelling stays cheap.
  const BATCH = 16;
  for (let i = 0; i < todo.length; i += BATCH) {
    if (token !== bulkToken) return;
    const batch = todo.slice(i, i + BATCH);
    await Promise.all(
      batch.map(
        (id) =>
          new Promise<void>((resolve) => {
            const key = keyOf(id, size);
            if (requestImage(id, size, PRIORITY_PREFETCH)) return resolve();
            if (!queue.isPending(key)) {
              useImageBulk.setState((s) => ({ failed: s.failed + 1 }));
              return resolve();
            }
            const unsubscribe = subscribe(key, () => {
              unsubscribe();
              if (!uris.has(key)) useImageBulk.setState((s) => ({ failed: s.failed + 1 }));
              resolve();
            });
          })
      )
    );
    if (token !== bulkToken) return;
    useImageBulk.setState((s) => ({ done: Math.min(s.total, s.done + batch.length) }));
  }
  if (token === bulkToken) useImageBulk.setState({ running: false });
}

export function cancelBulkDownload(): void {
  bulkToken++;
  useImageBulk.setState({ running: false });
}

/** Quietly prefetches images (e.g. all cards of a deck). */
export function prefetchImages(imageIds: number[], size: ImageSize): void {
  for (const id of new Set(imageIds)) requestImage(id, size, PRIORITY_PREFETCH);
}

export async function getImageCacheStats(): Promise<{ count: number; bytes: number | null }> {
  return imageBackend.stats();
}

export async function clearImageCache(): Promise<void> {
  cancelBulkDownload();
  queue.clear();
  await imageBackend.clear();
  uris.clear();
  missing.clear();
  failedAt.clear();
  for (const key of listeners.keys()) emit(key);
}
