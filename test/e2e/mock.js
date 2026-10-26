// Network mocks for YGOPRODeck (API + images) so the web smoke test runs
// without internet access and without hitting the real API.
const fs = require('fs');
const path = require('path');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const read = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

// The remaining cards of the engine fixtures (AI preset decks), converted
// from EDOPro's card database into YGOPRODeck's format (English only).
function engineFixtureCards(known) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(FIXTURES, 'engine', 'cards.cdb'));
  const rows = db.prepare('SELECT d.id, d.type, d.atk, d.def, d.level, d.race, d.attribute, t.name, t.desc FROM datas d JOIN texts t ON t.id = d.id').all();
  db.close();
  const RACES = ['Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic', 'Divine-Beast', 'Creator God', 'Wyrm', 'Cyberse', 'Illusion'];
  const ATTRIBUTES = ['EARTH', 'WATER', 'FIRE', 'WIND', 'LIGHT', 'DARK', 'DIVINE'];
  const bit = (v) => Math.round(Math.log2(Number(v) & -Number(v)));
  return rows
    .filter((r) => !known.has(r.id))
    .map((r) => {
      const t = Number(r.type);
      const images = [{ id: r.id, image_url: `https://images.ygoprodeck.com/images/cards/${r.id}.jpg`, image_url_small: `https://images.ygoprodeck.com/images/cards_small/${r.id}.jpg` }];
      if (t & 2) {
        const race = t & 0x10000 ? 'Quick-Play' : t & 0x20000 ? 'Continuous' : t & 0x40000 ? 'Equip' : t & 0x80000 ? 'Field' : t & 0x80 ? 'Ritual' : 'Normal';
        return { id: r.id, name: r.name, type: 'Spell Card', frameType: 'spell', desc: r.desc, race, card_images: images };
      }
      if (t & 4) {
        const race = t & 0x20000 ? 'Continuous' : t & 0x100000 ? 'Counter' : 'Normal';
        return { id: r.id, name: r.name, type: 'Trap Card', frameType: 'trap', desc: r.desc, race, card_images: images };
      }
      const frame = t & 0x4000000 ? 'link' : t & 0x800000 ? 'xyz' : t & 0x2000 ? 'synchro' : t & 0x40 ? 'fusion' : t & 0x80 ? 'ritual' : t & 0x4000 ? 'token' : t & 0x20 ? 'effect' : 'normal';
      const typeName = { link: 'Link Monster', xyz: 'XYZ Monster', synchro: 'Synchro Monster', fusion: 'Fusion Monster', ritual: 'Ritual Monster', token: 'Token', effect: 'Effect Monster', normal: 'Normal Monster' }[frame];
      const card = { id: r.id, name: r.name, type: typeName, frameType: frame, desc: r.desc, race: RACES[bit(r.race)], attribute: ATTRIBUTES[bit(r.attribute)], atk: r.atk, card_images: images };
      if (frame === 'link') return { ...card, linkval: Number(r.level) & 0xff };
      return { ...card, def: r.def, level: Number(r.level) & 0xff };
    });
}

// Main fixtures plus the classic cards used by the sample puzzles and AI decks.
const baseEn = [...read('cardinfo.en.json').data, ...read('puzzle-cards.en.json').data];
const en = { data: [...baseEn, ...engineFixtureCards(new Set(baseEn.map((c) => c.id)))] };
const de = { data: [...read('cardinfo.de.json').data, ...read('puzzle-cards.de.json').data] };
const CORS = { 'Access-Control-Allow-Origin': '*' };
const FRAME_COLORS = { normal: '#c9a35a', effect: '#c0703a', fusion: '#8a4fa3', synchro: '#d9d9d9', xyz: '#2b2b2b', link: '#1f5fa8', effect_pendulum: '#c0703a', spell: '#1d9e74', trap: '#bc4a8d' };

const cardByImageId = new Map();
for (const card of en.data) for (const image of card.card_images ?? []) cardByImageId.set(image.id, card);

function placeholderSvg(id) {
  const card = cardByImageId.get(id);
  const color = FRAME_COLORS[card?.frameType] ?? '#888';
  const name = (card?.name ?? String(id)).replace(/[<&>"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="421" height="614" viewBox="0 0 421 614">
<rect width="421" height="614" fill="${color}"/><rect x="50" y="110" width="321" height="270" fill="#0004"/>
<text x="210" y="70" font-size="30" font-family="sans-serif" font-weight="bold" text-anchor="middle">${name.slice(0, 22)}</text>
<text x="210" y="560" font-size="26" font-family="sans-serif" text-anchor="middle">#${id}</text></svg>`;
}

const state = { offline: false, api: [], images: 0, github: [] };

// EDOPro data (card database, scripts, strings) from the engine fixtures.
const ENGINE = path.join(FIXTURES, 'engine');
function engineFile(url) {
  const { pathname } = new URL(url);
  if (pathname.endsWith('/BabelCDB/master/cards.cdb')) return { body: fs.readFileSync(path.join(ENGINE, 'cards.cdb')), contentType: 'application/octet-stream' };
  if (pathname.endsWith('/config/strings.conf')) return { body: fs.readFileSync(path.join(ENGINE, 'strings.conf')), contentType: 'text/plain' };
  const match = pathname.match(/\/CardScripts\/master\/(?:official\/|pre-release\/)?([^/]+\.lua)$/);
  if (match && fs.existsSync(path.join(ENGINE, 'scripts', match[1])) && !pathname.includes('/pre-release/')) {
    return { body: fs.readFileSync(path.join(ENGINE, 'scripts', match[1])), contentType: 'text/plain' };
  }
  return null;
}

async function install(context) {
  await context.route('https://db.ygoprodeck.com/**', (route) => {
    if (state.offline) return route.abort('internetdisconnected');
    const url = new URL(route.request().url());
    state.api.push(url.pathname + url.search);
    if (url.pathname.endsWith('checkDBVer.php')) {
      return route.fulfill({ json: [{ database_version: '148.20', last_update: '2026-10-20 10:00:00' }], headers: CORS });
    }
    const banlist = url.searchParams.get('banlist');
    if (banlist) {
      return route.fulfill({ json: { data: en.data.filter((c) => c.banlist_info?.[`ban_${banlist}`]) }, headers: CORS });
    }
    return route.fulfill({ json: url.searchParams.get('language') === 'de' ? de : en, headers: CORS });
  });
  await context.route('https://raw.githubusercontent.com/**', (route) => {
    if (state.offline) return route.abort('internetdisconnected');
    state.github.push(route.request().url());
    const file = engineFile(route.request().url());
    if (!file) return route.fulfill({ status: 404, headers: CORS, body: '404: Not Found' });
    return route.fulfill({ body: file.body, contentType: file.contentType, headers: CORS });
  });
  await context.route('https://images.ygoprodeck.com/**', (route) => {
    if (state.offline) return route.abort('internetdisconnected');
    const match = route.request().url().match(/\/(\d+)\.jpg$/);
    if (!match || !cardByImageId.has(Number(match[1]))) return route.fulfill({ status: 404, headers: CORS, body: '' });
    state.images++;
    return route.fulfill({ body: placeholderSvg(Number(match[1])), contentType: 'image/svg+xml', headers: CORS });
  });
}

module.exports = { install, state };
