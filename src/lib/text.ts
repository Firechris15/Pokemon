/**
 * Folds text for case- and accent-insensitive search:
 * "Aschblüte" -> "aschblute", "Ｓ" -> "s".
 */
export function foldForSearch(text: string): string {
  // normalize() needs Intl support in the JS engine; without it, folding still
  // stays consistent because the same function builds the search column.
  const decomposed = typeof text.normalize === 'function' ? text.normalize('NFKD') : text;
  return decomposed
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escapes LIKE wildcards so user input is matched literally (use with ESCAPE '\'). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
