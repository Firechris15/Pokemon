import * as SecureStore from 'expo-secure-store';

const KEY = 'claude-api-key';

/** Where the key lives, for the settings screen. */
export const KEY_STORAGE = 'im iOS-Schlüsselbund (Keychain), nur auf diesem Gerät';

/** iOS: the Claude API key is kept in the keychain, never in the database or a file. */
export async function loadApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function saveApiKey(value: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function deleteApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
