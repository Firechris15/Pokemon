export type DownloadProgress = { received: number; total: number | null };

/** Web variant: streams the response to report progress. */
export async function downloadJson(
  url: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Download fehlgeschlagen. Bitte Internetverbindung prüfen.');
  }
  if (!response.ok) throw new Error(`YGOPRODeck antwortete mit Status ${response.status}.`);

  const lengthHeader = Number(response.headers.get('Content-Length'));
  const total = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
  if (!response.body || !onProgress) return response.json();

  return JSON.parse(new TextDecoder().decode(await readWithProgress(response, total, onProgress)));
}

async function readWithProgress(response: Response, total: number | null, onProgress: (progress: DownloadProgress) => void): Promise<Uint8Array> {
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress({ received, total });
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Downloads a binary file (e.g. EDOPro's card database) into memory. */
export async function downloadBytes(url: string, onProgress?: (progress: DownloadProgress) => void): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Download fehlgeschlagen. Bitte Internetverbindung prüfen.');
  }
  if (!response.ok) throw new Error(`Download fehlgeschlagen (Status ${response.status}).`);
  const lengthHeader = Number(response.headers.get('Content-Length'));
  const total = Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
  if (!response.body || !onProgress) return new Uint8Array(await response.arrayBuffer());
  return readWithProgress(response, total, onProgress);
}
