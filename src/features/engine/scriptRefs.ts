/** Where EDOPro keeps its Lua card scripts (AGPL-3.0). */
export const SCRIPT_BASE_URL = 'https://raw.githubusercontent.com/ProjectIgnis/CardScripts/master/';
export const CDB_URL = 'https://raw.githubusercontent.com/ProjectIgnis/BabelCDB/master/cards.cdb';
export const STRINGS_URL = 'https://raw.githubusercontent.com/ProjectIgnis/Distribution/master/config/strings.conf';

/** Scripts the engine loads before every duel; they load the rest themselves. */
export const BASE_SCRIPTS = ['constant.lua', 'utility.lua'];

export const cardScriptName = (code: number) => `c${code}.lua`;

/** Repository paths to try for a script: card scripts live in official/ or pre-release/. */
export function scriptPaths(name: string): string[] {
  return /^c\d+\.lua$/.test(name) ? [`official/${name}`, `pre-release/${name}`] : [name];
}

/** Scripts a script loads itself (Duel.LoadScript / Duel.LoadCardScript). */
export function referencedScripts(source: string): string[] {
  return [...new Set([...source.matchAll(/Load(?:Card)?Script\("([^"]+)"\)/g)].map((m) => m[1]))];
}
