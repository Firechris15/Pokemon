import { Directory, File, Paths } from 'expo-file-system';

import type { ImageSize } from './types';

/**
 * iOS/Android image storage: JPEGs in the app's document directory
 * (not the cache directory, which iOS may purge, breaking offline use).
 */
const ROOT = 'card-images';

function directory(size: ImageSize): Directory {
  return new Directory(Paths.document, ROOT, size);
}

function fileFor(imageId: number, size: ImageSize): File {
  return new File(Paths.document, ROOT, size, `${imageId}.jpg`);
}

const createdDirs = new Set<ImageSize>();

function ensureDirectory(size: ImageSize) {
  if (createdDirs.has(size)) return;
  const dir = directory(size);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  createdDirs.add(size);
}

export const imageBackend = {
  peek(imageId: number, size: ImageSize): string | null {
    const file = fileFor(imageId, size);
    return file.exists ? file.uri : null;
  },

  async lookup(imageId: number, size: ImageSize): Promise<string | null> {
    return this.peek(imageId, size);
  },

  async download(url: string, imageId: number, size: ImageSize): Promise<string> {
    ensureDirectory(size);
    const file = await File.downloadFileAsync(url, fileFor(imageId, size), { idempotent: true });
    return file.uri;
  },

  async stats(): Promise<{ count: number; bytes: number | null }> {
    let count = 0;
    let bytes = 0;
    for (const size of ['small', 'full'] as const) {
      const dir = directory(size);
      if (!dir.exists) continue;
      const info = dir.info();
      count += info.files?.length ?? 0;
      bytes += info.size ?? 0;
    }
    return { count, bytes };
  },

  async clear(): Promise<void> {
    const root = new Directory(Paths.document, ROOT);
    if (root.exists) root.delete();
    createdDirs.clear();
  },
};
