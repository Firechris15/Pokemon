import type { DocumentPickerAsset } from 'expo-document-picker';

export async function readPickedFile(asset: DocumentPickerAsset): Promise<string> {
  if (asset.file) return asset.file.text();
  const response = await fetch(asset.uri);
  return response.text();
}
