/**
 * Web smoke test: drives the exported web build in Chromium with mocked
 * YGOPRODeck responses and checks the Phase 1 flows end to end
 * (card sync, import, deck editor, validation, card detail gestures,
 * persistence and offline image cache).
 *
 *   npm run test:e2e        (builds dist/ first)
 *
 * Requires Playwright with Chromium (npx playwright install chromium).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const mock = require('./mock');
const { serve } = require('./server');

const PORT = 8089;
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.join(__dirname, 'screenshots');
const assert = (cond, msg) => {
  if (!cond) throw new Error('ASSERT: ' + msg);
  console.log('ok -', msg);
};

const YDK = `#created by test
#main
14558127
14558127
14558127
36996508
9674034
9674034
48452496
24224830
24224830
23434538
10045474
#extra
86066372
84815190
!side
27204311
`;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve(path.resolve(__dirname, '..', '..', 'dist'), PORT);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 } });
  await mock.install(context);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  await page.goto(`${BASE}/`);
  await page.getByTestId('card-db-update').click();
  await page.getByText('Karten offline verfügbar').waitFor();

  // Decks -> import
  await page.getByTestId('tile-decks').click();
  await page.getByTestId('import-deck').click();
  await page.getByTestId('import-text').fill(YDK);
  await page.getByTestId('import-name').fill('Snake-Eye Test');
  await page.getByTestId('import-preview').waitFor();
  const preview = await page.getByTestId('import-preview').innerText();
  assert(/11[\s\S]*Main/.test(preview) && /2[\s\S]*Extra/.test(preview) && preview.includes('Alle Karten erkannt'), 'import preview counts 11/2/1');
  await page.screenshot({ path: path.join(SHOTS, '03-import.png') });
  await page.getByTestId('import-save').click();

  // Editor
  await page.getByTestId('validation-bar').waitFor();
  await page.waitForTimeout(800);
  const mainTiles = await page.locator('[data-testid^="deck-card-main-"]').count();
  assert(mainTiles === 7, `7 unique main deck cards shown (got ${mainTiles})`);
  assert(await page.getByTestId('deck-card-main-46986414').count() === 1, 'alt artwork 36996508 mapped to Dark Magician');
  const validation = await page.getByTestId('validation-bar').innerText();
  assert(validation.includes('Probleme'), 'deck flagged as not legal');
  await page.getByTestId('validation-bar').click();
  await page.waitForTimeout(200);
  const issues = await page.getByTestId('validation-bar').innerText();
  assert(issues.includes('Maxx „C“ ist verboten (TCG)'), 'forbidden card reported');
  assert(issues.includes('Vom Grab gerufen ist limitiert'), 'limited card reported');
  assert(issues.includes('mindestens 40'), 'main deck size reported');
  await page.screenshot({ path: path.join(SHOTS, '04-editor.png') });

  // Search + add
  await page.getByTestId('card-search-input').fill('nibiru');
  await page.getByTestId('add-27204311').waitFor();
  await page.getByTestId('add-27204311').click();
  await page.waitForTimeout(400);
  assert(await page.getByTestId('deck-card-main-27204311').count() === 1, 'Nibiru added to main deck via search');
  // 4th copy of Ash must be rejected
  await page.getByTestId('card-search-input').fill('asch');
  await page.getByTestId('add-14558127').waitFor();
  await page.getByTestId('add-14558127').click();
  await page.getByText('keine weitere Kopie erlaubt').waitFor();
  assert(true, '4th copy rejected with message');
  // Extra deck card goes to extra automatically
  await page.getByTestId('card-search-input').fill('zeus');
  await page.getByTestId('add-90448279').click();
  await page.waitForTimeout(400);
  assert(await page.getByTestId('deck-card-extra-90448279').count() === 1, 'Xyz monster auto-sorted into Extra Deck');

  // Filters
  await page.getByTestId('card-search-input').fill('');
  await page.getByTestId('toggle-filters').click();
  await page.getByTestId('filter-frame-extra').click();
  await page.waitForTimeout(500);
  const extraResults = await page.locator('[data-testid^="search-result-"]').count();
  assert(extraResults === 4, `extra deck filter shows 4 cards (got ${extraResults})`);
  await page.getByTestId('filter-attribute-DARK').click();
  await page.waitForTimeout(500);
  const darkExtra = await page.locator('[data-testid^="search-result-"]').count();
  assert(darkExtra === 1, `extra + DARK shows 1 card (got ${darkExtra})`);
  await page.getByTestId('archetype-input').fill('snake');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, '05-filters.png') });
  await page.getByTestId('toggle-filters').click();

  // Card detail: open via tap, close via backdrop
  await page.getByTestId('deck-card-main-14558127').click();
  await page.getByTestId('card-detail').waitFor();
  await page.waitForTimeout(700);
  const detail = await page.getByTestId('card-detail').innerText();
  assert(detail.includes('Aschblüte & Fröhlicher Frühling') && detail.includes('Ash Blossom & Joyous Spring'), 'detail shows DE + EN name');
  assert(detail.includes('[Zombie/Empfänger/Effekt]') && detail.includes('ATK 0 / DEF 1800') && detail.includes('Stufe 3'), 'detail shows type line and stats');
  assert(detail.includes('annulliere'), 'detail shows German card text');
  await page.screenshot({ path: path.join(SHOTS, '06-detail.png') });
  // +1 from detail actions is blocked (3 copies), -1 works
  await page.getByTestId('detail-remove').click();
  await page.waitForTimeout(300);
  assert(/main 2/i.test(await page.getByTestId('card-detail').innerText()), 'remove from detail view works');
  await page.mouse.click(15, 420); // outside the sheet
  await page.getByTestId('card-detail').waitFor({ state: 'detached' });
  assert(true, 'tap outside closes detail');

  // Swipe down closes
  await page.getByTestId('deck-card-main-46986414').click();
  await page.getByTestId('card-detail-image').waitFor();
  await page.waitForTimeout(500);
  const box = await page.getByTestId('card-detail-image').boundingBox();
  const x = box.x + box.width / 2, y = box.y + 120;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(x, y + i * 22); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.getByTestId('card-detail').waitFor({ state: 'detached', timeout: 3000 });
  assert(true, 'swipe down closes detail');

  // Paging with swipe left
  await page.getByTestId('deck-card-main-14558127').click();
  await page.getByTestId('card-detail-image').waitFor();
  await page.waitForTimeout(500);
  const before = await page.getByTestId('card-detail').innerText();
  const b2 = await page.getByTestId('card-detail-image').boundingBox();
  const sx = b2.x + b2.width - 30, sy = b2.y + 200;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(sx - i * 20, sy + 2); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(500);
  const after = await page.getByTestId('card-detail').innerText();
  const pos = (t) => (t.match(/(\d+) \/ (\d+)/) || [])[1];
  console.log('pager', pos(before), '->', pos(after));
  assert(Number(pos(after)) === Number(pos(before)) + 1 && !after.includes('Aschblüte'), 'swipe left pages to next card');
  await page.keyboard.press('Escape');
  await page.getByTestId('card-detail').waitFor({ state: 'detached' });
  assert(true, 'Escape closes detail');

  // Images were downloaded once and cached
  await page.waitForTimeout(1500);
  const imagesAfterEditor = mock.state.images;
  console.log('image downloads so far', imagesAfterEditor);

  // Reload: data persists (SQLite in OPFS)
  await page.reload();
  await page.getByTestId('validation-bar').waitFor();
  await page.waitForTimeout(1500);
  assert(await page.getByTestId('deck-card-main-27204311').count() === 1, 'deck persisted across reload');
  assert(mock.state.images === imagesAfterEditor, `no image re-downloads after reload (${mock.state.images})`);

  // Offline: API and images unreachable, everything still works
  mock.state.offline = true;
  await page.reload();
  await page.getByTestId('validation-bar').waitFor();
  await page.waitForTimeout(1500);
  const imgs = await page.locator('img[src^="blob:"]').count();
  assert(imgs > 0, `offline: images served from local cache (${imgs} blob images)`);
  await page.screenshot({ path: path.join(SHOTS, '07-editor-offline.png') });

  // Deck list: duplicate + delete
  await page.goto(`${BASE}/decks`);
  await page.locator('[data-testid^="duplicate-"]').first().click();
  await page.getByText('(Kopie)').first().waitFor();
  assert(await page.locator('[data-testid^="duplicate-"]').count() === 2, 'deck duplicated');
  await page.screenshot({ path: path.join(SHOTS, '08-decklist.png') });
  await page.locator('[data-testid^="delete-"]').first().click();
  await page.getByTestId('dialog-confirm').click();
  await page.waitForTimeout(400);
  assert(await page.locator('[data-testid^="duplicate-"]').count() === 1, 'copy deleted after confirmation');
  mock.state.offline = false;

  // Settings
  await page.goto(`${BASE}/settings`);
  await page.getByTestId('image-stats').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, '09-settings.png') });
  console.log('image stats:', await page.getByTestId('image-stats').innerText());

  // Update again: only version check + banlist
  mock.state.api.length = 0;
  await page.getByTestId('card-db-update').click();
  await page.getByText('Banlist wurde aktualisiert').waitFor();
  const expectedCalls = ['/api/v7/cardinfo.php?banlist=ocg', '/api/v7/cardinfo.php?banlist=tcg', '/api/v7/checkDBVer.php'];
  assert(JSON.stringify([...mock.state.api].sort()) === JSON.stringify(expectedCalls), 'second update only checks version + banlists');

  // ---------------------------------------------------------------- Phase 2: hand trainer
  const choose = (n, k) => {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  };
  const pct = (p) => `${(p * 100).toFixed(1).replace('.', ',')} %`;

  await page.goto(`${BASE}/`);
  await page.getByTestId('tile-hand').click();
  await page.locator('[data-testid^="hand-deck-"]').first().click();
  await page.getByTestId('hand-cards').waitFor();
  await page.waitForTimeout(500);
  assert((await page.locator('[data-testid^="hand-card-"]').count()) === 5, 'going first draws 5 cards');
  await page.getByTestId('going-second').click();
  await page.waitForTimeout(200);
  assert((await page.locator('[data-testid^="hand-card-"]').count()) === 6, 'going second shows 6 cards');
  await page.getByTestId('draw-one').click();
  assert((await page.locator('[data-testid^="hand-card-"]').count()) === 7, '+1 draw adds a card');

  // Tags
  await page.getByTestId('hand-tab-tags').click();
  await page.getByTestId('tag-starter-9674034').click();
  await page.getByTestId('tag-starter-48452496').click();
  await page.getByTestId('tag-brick-46986414').click();
  await page.getByTestId('suggest-tags').click();
  await page.getByText('Karten getaggt').waitFor();
  const ranking = await page.getByTestId('starter-ranking').innerText();
  assert(ranking.indexOf('Schlangenaugen-Asche') < ranking.indexOf('Schlangenaugen-Pappel'), 'starter ranking follows tagging order');
  await page.getByTestId('starter-up-48452496').click();
  await page.waitForTimeout(200);
  const reranked = await page.getByTestId('starter-ranking').innerText();
  assert(reranked.indexOf('Schlangenaugen-Pappel') < reranked.indexOf('Schlangenaugen-Asche'), 'starter can be moved up');
  const ashRow = await page.getByTestId('tag-row-14558127').innerText();
  assert(/Handtrap/.test(ashRow), 'Ash Blossom suggested as handtrap');
  await page.screenshot({ path: path.join(SHOTS, '13-hand-tags.png') });

  // Tags survive a reload
  await page.reload();
  await page.getByTestId('hand-tab-tags').click();
  await page.getByTestId('starter-ranking').waitFor();
  assert((await page.getByTestId('starter-ranking').innerText()).includes('Schlangenaugen-Pappel'), 'tags persisted across reload');

  // Statistics: compare the exact value with the closed formula
  await page.getByTestId('hand-tab-stats').click();
  await page.getByTestId('stats-table').waitFor();
  const intro = await page.getByText(/Exakt berechnet/).innerText();
  const N = Number(intro.match(/(\d+) Karten im Main Deck/)[1]);
  const starterRow = await page.getByTestId('stat-starter').innerText();
  const starters = 3; // Snake-Eye Ash x2 + Snake-Eyes Poplar x1
  const expectFirst = pct(1 - choose(N - starters, 5) / choose(N, 5));
  const expectSecond = pct(1 - choose(N - starters, 6) / choose(N, 6));
  assert(starterRow.includes(expectFirst) && starterRow.includes(expectSecond), `starter odds match formula (${expectFirst} / ${expectSecond}, N=${N})`);
  await page.waitForFunction(() => !document.querySelector('[data-testid="stat-starter"]').innerText.includes('Sim. …'), null, { timeout: 15000 });
  assert(true, 'simulation finished');
  const calc = await page.getByTestId('calculator-result').innerText();
  assert(calc === pct(1 - choose(N - 3, 5) / choose(N, 5)), `calculator default (3 copies, 5 cards) = ${calc}`);
  await page.screenshot({ path: path.join(SHOTS, '14-hand-stats.png') });
  await page.mouse.move(600, 500);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '14b-hand-stats-bottom.png') });

  // Practice
  await page.getByTestId('hand-tab-practice').click();
  await page.getByTestId('practice-panel').waitFor();
  await page.getByTestId('answer-unplayable').click();
  await page.getByTestId('practice-verdict').waitFor();
  await page.getByTestId('next-hand').click();
  await page.getByTestId('answer-playable').click();
  await page.getByTestId('choose-0').click();
  await page.getByTestId('answer-submit').click();
  await page.getByTestId('practice-verdict').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, '15-hand-practice.png') });
  const score = await page.getByTestId('practice-score').innerText();
  assert(/\/2 richtig/.test(score) && /Gesamt: 2 Hände/.test(score), 'practice answers counted and stored: ' + score.replace(/\n/g, ' '));
  await page.getByTestId('next-hand').click();
  await page.getByTestId('hand-tab-draw').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, '16-hand-draw.png') });

  // Phone portrait
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mock.install(phone);
  const p2 = await phone.newPage();
  await p2.goto(`${BASE}/`);
  await p2.getByTestId('card-db-update').click();
  await p2.getByText('Karten offline verfügbar').waitFor();
  await p2.screenshot({ path: path.join(SHOTS, '10-phone-home.png') });
  await p2.getByTestId('tile-cards').click();
  await p2.getByTestId('card-search-results').waitFor();
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: path.join(SHOTS, '11-phone-cards.png') });
  await p2.getByTestId('search-result-86066372').click();
  await p2.getByTestId('card-detail').waitFor();
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: path.join(SHOTS, '12-phone-detail.png') });

  console.log('\nERRORS:\n' + (errors.join('\n') || '(none)'));
  await browser.close();
  server.close();
  if (errors.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
