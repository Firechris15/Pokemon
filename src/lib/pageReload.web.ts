/**
 * Web: the database lives in the browser's private file system and only one
 * page at a time may hold it. Right after a reload (e.g. for an update) the
 * previous page can still hold it for a moment; the SQLite worker then
 * fails and stays broken, so only a fresh page helps.
 */
const RETRIES_KEY = 'startup-retries';
const MAX_RETRIES = 3;

/** Schedules a page reload after a growing pause; false once the retries are used up. */
export function retryWithReload(): boolean {
  let tries = 0;
  try {
    tries = Number(sessionStorage.getItem(RETRIES_KEY) ?? 0);
    if (tries >= MAX_RETRIES) return false;
    sessionStorage.setItem(RETRIES_KEY, String(tries + 1));
  } catch {
    return false;
  }
  setTimeout(() => window.location.reload(), 1000 * (tries + 1));
  return true;
}

export function startupSucceeded(): void {
  try {
    sessionStorage.removeItem(RETRIES_KEY);
  } catch {
    // Nothing stored.
  }
}

export const canReloadPage = true;

export function reloadPage(): void {
  startupSucceeded();
  window.location.reload();
}

/** After an update reload (?v=…), give the previous page a moment to release the database. */
export async function afterUpdateReload(): Promise<void> {
  if (new URL(window.location.href).searchParams.has('v')) await new Promise((resolve) => setTimeout(resolve, 600));
}
