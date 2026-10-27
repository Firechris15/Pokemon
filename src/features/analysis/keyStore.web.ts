const KEY = 'claude-api-key';

/** Browsers have no keychain: the key stays in this browser's local storage. */
export const KEY_STORAGE = 'nur in diesem Browser (lokaler Speicher, kein Schlüsselbund)';

export async function loadApiKey(): Promise<string | null> {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function saveApiKey(value: string): Promise<void> {
  localStorage.setItem(KEY, value);
}

export async function deleteApiKey(): Promise<void> {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
