import * as Clipboard from 'expo-clipboard';

import { showToast } from '@/components/ui/dialogs';

import type { Deck } from './types';
import { toYdk, toYdke, ydkFileName } from './ydk';

/** Web: downloads the deck as a .ydk file. */
export async function exportDeckFile(deck: Deck): Promise<void> {
  const blob = new Blob([toYdk(deck)], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = ydkFileName(deck.name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyYdke(deck: Deck): Promise<void> {
  await Clipboard.setStringAsync(toYdke(deck));
  showToast('ydke-Link kopiert', 'success');
}

export async function readClipboardText(): Promise<string> {
  return Clipboard.getStringAsync();
}
