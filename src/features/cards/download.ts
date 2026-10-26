import { File, Paths } from 'expo-file-system';

export type DownloadProgress = { received: number; total: number | null };

/**
 * Downloads a (large) JSON file. On iOS/Android the native downloader writes
 * to a temp file first, which gives byte progress and keeps the transfer off
 * the JS thread; the file is parsed and deleted afterwards.
 */
export async function downloadJson(
  url: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<unknown> {
  const target = new File(Paths.cache, `download-${Date.now()}.json`);
  try {
    await File.downloadFileAsync(url, target, {
      idempotent: true,
      headers: { Accept: 'application/json' },
      onProgress: onProgress
        ? ({ bytesWritten, totalBytes }) =>
            onProgress({ received: bytesWritten, total: totalBytes > 0 ? totalBytes : null })
        : undefined,
    });
    const text = await target.text();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Die heruntergeladenen Kartendaten sind beschädigt.');
    throw new Error(
      `Download fehlgeschlagen. Bitte Internetverbindung prüfen. (${error instanceof Error ? error.message : String(error)})`
    );
  } finally {
    if (target.exists) target.delete();
  }
}
