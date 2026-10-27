/** Native builds are updated through TestFlight; nothing to check here. */
export async function newerBuild(): Promise<string | null> {
  return null;
}

export function loadBuild(_build: string): boolean {
  return false;
}
