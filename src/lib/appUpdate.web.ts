/**
 * Web version (GitHub Pages): each deploy writes version.json and builds the
 * same id into the app. A page that was loaded before a deploy (e.g. a
 * home-screen app kept in memory) finds out here and loads the new build.
 */
const BUILD = process.env.EXPO_PUBLIC_BUILD_ID;
const BASE = process.env.EXPO_BASE_URL ?? '';
const RELOADED_KEY = 'app-update-reloaded';

/** Id of a newer deployed build, or null (current, offline, or a local build without an id). */
export async function newerBuild(): Promise<string | null> {
  if (!BUILD) return null;
  // A slow network must not hold up the app start.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return null;
    const { build } = (await response.json()) as { build?: string };
    return build && build !== BUILD ? build : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Reloads the page with a fresh URL (GitHub Pages lets browsers cache the page for 10 minutes). At most once per build. */
export function loadBuild(build: string): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === build) return false;
    sessionStorage.setItem(RELOADED_KEY, build);
  } catch {
    // Without session storage there is no loop guard; reload anyway.
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', build.slice(0, 12));
  window.location.replace(url.toString());
  return true;
}
