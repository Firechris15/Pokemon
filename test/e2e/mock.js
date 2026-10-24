// Network mocks for YGOPRODeck (API + images) so the web smoke test runs
// without internet access and without hitting the real API.
const fs = require('fs');
const path = require('path');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const en = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'cardinfo.en.json'), 'utf8'));
const de = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'cardinfo.de.json'), 'utf8'));
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

const state = { offline: false, api: [], images: 0 };

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
  await context.route('https://images.ygoprodeck.com/**', (route) => {
    if (state.offline) return route.abort('internetdisconnected');
    const match = route.request().url().match(/\/(\d+)\.jpg$/);
    if (!match || !cardByImageId.has(Number(match[1]))) return route.fulfill({ status: 404, headers: CORS, body: '' });
    state.images++;
    return route.fulfill({ body: placeholderSvg(Number(match[1])), contentType: 'image/svg+xml', headers: CORS });
  });
}

module.exports = { install, state };
