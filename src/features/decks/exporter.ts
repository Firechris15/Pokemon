import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { showToast } from '@/components/ui/dialogs';

import type { Deck } from './types';
import { toYdk, toYdke, ydkFileName } from './ydk';

/** Shares the deck as a .ydk file (iOS share sheet: save to Files, AirDrop, …). */
export async function exportDeckFile(deck: Deck): Promise<void> {
  const file = new File(Paths.cache, ydkFileName(deck.name));
  if (file.exists) file.delete();
  file.create();
  await file.write(toYdk(deck));
  if (!(await Sharing.isAvailableAsync())) {
    showToast('Teilen ist auf diesem Gerät nicht verfügbar.', 'error');
    return;
  }
  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: deck.name });
}

export async function copyYdke(deck: Deck): Promise<void> {
  await Clipboard.setStringAsync(toYdke(deck));
  showToast('ydke-Link kopiert', 'success');
}

export async function readClipboardText(): Promise<string> {
  return Clipboard.getStringAsync();
}
