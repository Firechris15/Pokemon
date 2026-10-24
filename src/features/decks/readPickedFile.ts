import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';

/** Reads a file chosen in the iOS Files app (copied to the app cache by the picker). */
export async function readPickedFile(asset: DocumentPickerAsset): Promise<string> {
  return new File(asset.uri).text();
}
