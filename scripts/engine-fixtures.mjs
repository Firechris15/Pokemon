// Builds the engine test fixtures (test/fixtures/engine) from the EDOPro
// sources: card data for the cards used in tests and e2e runs, the Lua
// scripts they need (recursively) and the English system strings.
//
//   node scripts/engine-fixtures.mjs
//
// Card data: https://github.com/ProjectIgnis/BabelCDB (cards.cdb)
// Scripts:   https://github.com/ProjectIgnis/CardScripts (AGPL-3.0)
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAW = 'https://raw.githubusercontent.com/ProjectIgnis';
const OUT = path.resolve('test/fixtures/engine');
const TMP = path.join(OUT, '.cache');

// Preset AI decks, sample puzzles and the Snake-Eye test deck.
const deckFile = fs.readFileSync('src/features/engine/presetDecks.ts', 'utf8');
const presetCodes = [...deckFile.matchAll(/\b(\d{6,9})\b/g)].map((m) => Number(m[1]));
const puzzleFile = fs.readFileSync('src/features/puzzles/samples.ts', 'utf8');
const puzzleCodes = [...puzzleFile.matchAll(/: (\d{6,9}),/g)].map((m) => Number(m[1]));
const extraCodes = [9674034, 48452496, 89023486, 14558127, 23434538, 24224830, 10045474, 25311006, 27204311, 86066372, 84815190, 90448279, 54757758, 16178681, 73915052];
const codes = [...new Set([...presetCodes, ...puzzleCodes, ...extraCodes])].sort((a, b) => a - b);

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

fs.mkdirSync(TMP, { recursive: true });
const cdbPath = path.join(TMP, 'cards.cdb');
if (!fs.existsSync(cdbPath)) fs.writeFileSync(cdbPath, await download(`${RAW}/BabelCDB/master/cards.cdb`));
const source = new DatabaseSync(cdbPath);

// Mini cards.cdb with the same schema, for the app's import path in e2e tests.
const miniPath = path.join(OUT, 'cards.cdb');
fs.rmSync(miniPath, { force: true });
const mini = new DatabaseSync(miniPath);
for (const { sql } of source.prepare("SELECT sql FROM sqlite_master WHERE type = 'table'").all()) mini.exec(sql);
const datas = source.prepare('SELECT * FROM datas WHERE id = ?');
datas.setReadBigInts(true);
const texts = source.prepare('SELECT * FROM texts WHERE id = ?');
const found = [];
for (const code of codes) {
  const d = datas.get(code);
  const t = texts.get(code);
  if (!d || !t) {
    console.warn('missing card', code);
    continue;
  }
  found.push(code);
  mini.prepare(`INSERT INTO datas VALUES (${Object.keys(d).map(() => '?').join(',')})`).run(...Object.values(d));
  mini.prepare(`INSERT INTO texts VALUES (${Object.keys(t).map(() => '?').join(',')})`).run(...Object.values(t));
}
mini.close();
console.log(`cards: ${found.length}`);

// Scripts, following LoadScript references.
const scriptDir = path.join(OUT, 'scripts');
fs.mkdirSync(scriptDir, { recursive: true });
const seen = new Set();
async function fetchScript(name) {
  if (seen.has(name)) return;
  seen.add(name);
  const candidates = /^c\d+\.lua$/.test(name) ? [`official/${name}`, `pre-release/${name}`] : [name];
  for (const candidate of candidates) {
    const body = await download(`${RAW}/CardScripts/master/${candidate}`);
    if (!body) continue;
    const text = body.toString('utf8');
    fs.writeFileSync(path.join(scriptDir, name), text);
    for (const m of text.matchAll(/Load(?:Card)?Script\("([^"]+)"\)/g)) await fetchScript(m[1]);
    return;
  }
}
await fetchScript('constant.lua');
await fetchScript('utility.lua');
for (const code of found) await fetchScript(`c${code}.lua`);
console.log(`scripts: ${fs.readdirSync(scriptDir).length}`);

fs.writeFileSync(path.join(OUT, 'strings.conf'), await download(`${RAW}/Distribution/master/config/strings.conf`));
fs.rmSync(TMP, { recursive: true, force: true });
