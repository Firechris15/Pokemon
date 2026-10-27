/**
 * Web smoke test: drives the exported web build in Chromium with mocked
 * YGOPRODeck responses and checks the flows end to end: card sync, import,
 * deck editor, validation, card detail gestures, persistence, offline image
 * cache, hand trainer, combo quiz and puzzles (drag & drop, editor).
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
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await mock.install(context);
  const page = await context.newPage();
  const errors = [];
  // Scripts that do not exist upstream (e.g. Normal Monsters) answer 404 – expected; any other 404 is an error.
  page.on('console', (m) => {
    // 404: card scripts that do not exist upstream; 401: the deliberately invalid Claude API key below.
    if (m.type() === 'error' && !/^Failed to load resource: the server responded with a status of (404|401)/.test(m.text())) errors.push(`[console] ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() === 404 && !r.url().startsWith('https://raw.githubusercontent.com/ProjectIgnis/CardScripts/')) errors.push(`[404] ${r.url()}`);
  });
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
  // 5 sample cards + 5 from the preset decks (Decode Talker, Linkuriboh, three Blue-Eyes/XYZ fusions).
  assert(extraResults === 10, `extra deck filter shows 10 cards (got ${extraResults})`);
  await page.getByTestId('filter-attribute-DARK').click();
  await page.waitForTimeout(500);
  const darkExtra = await page.locator('[data-testid^="search-result-"]').count();
  assert(darkExtra === 3, `extra + DARK shows 3 cards (got ${darkExtra})`);
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

  // ---------------------------------------------------------------- Phase 3: combo trainer
  const pickerTab = (title) => page.getByTestId('card-picker').getByText(new RegExp(`^${title} \\(`)).click();

  await page.goto(`${BASE}/`);
  await page.getByTestId('tile-combos').click();
  await page.getByTestId('new-combo').click();
  await page.getByTestId('dialog-input').fill('Snake-Eye Test-Combo');
  await page.getByTestId('dialog-confirm').click();
  await page.getByTestId('pick-starting-hand').waitFor();

  // Starting hand from the deck
  await page.getByTestId('pick-starting-hand').click();
  await pickerTab('Main Deck');
  await page.getByTestId('picker-card-9674034').locator('[role="button"]').first().click();
  await page.getByTestId('picker-card-14558127').locator('[role="button"]').first().click();
  await page.getByTestId('picker-done').click();
  await page.getByTestId('card-picker').waitFor({ state: 'detached' });

  const addStep = async ({ cardTab, cardId, action, targets, note }) => {
    await page.getByTestId('add-step').click();
    await page.getByTestId('step-choose-card').click();
    await pickerTab(cardTab);
    await page.getByTestId(`picker-card-${cardId}`).locator('[role="button"]').first().click();
    await page.getByTestId('card-picker').waitFor({ state: 'detached' });
    await page.getByTestId(`step-action-${action}`).click();
    if (targets) {
      await page.getByTestId('step-choose-targets').click();
      await pickerTab(targets.tab);
      for (const id of targets.ids) await page.getByTestId(`picker-card-${id}`).locator('[role="button"]').first().click();
      await page.getByTestId('picker-done').click();
      await page.getByTestId('card-picker').waitFor({ state: 'detached' });
    }
    if (note) await page.getByTestId('step-note').fill(note);
    await page.getByTestId('step-save').click();
    await page.getByTestId('step-editor').waitFor({ state: 'detached' });
  };
  await addStep({ cardTab: 'Hand', cardId: 9674034, action: 'normal_summon' });
  await addStep({ cardTab: 'Feld', cardId: 9674034, action: 'search', targets: { tab: 'Main Deck', ids: [48452496] }, note: 'Ash sucht Poplar.' });
  await addStep({ cardTab: 'Hand', cardId: 48452496, action: 'special_summon' });
  await addStep({ cardTab: 'Extra Deck', cardId: 86066372, action: 'link_summon', targets: { tab: 'Feld', ids: [9674034, 48452496] } });
  assert((await page.locator('[data-testid^="combo-step-"]').count()) === 4, 'four combo steps recorded via the card picker');
  const finalField = await page.getByTestId('zone-field').innerText();
  const finalGy = await page.getByTestId('zone-gy').innerText();
  assert(finalField.includes('Zugangscode-Sprecher') && finalGy.includes('Schlangenaugen-Asche') && finalGy.includes('Schlangenaugen-Pappel'), 'board tracker: link monster on field, materials in GY');
  await page.getByTestId('endboard-from-field').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, '17-combo-editor.png') });

  // Multiple choice quiz: answer step 2 wrong on purpose
  await page.getByTestId('editor-quiz').click();
  await page.getByTestId('quiz-option-0').waitFor();
  const expected = [
    'Normalbeschwörung: Schlangenaugen-Asche',
    'Suchen: Schlangenaugen-Asche – Sucht: Schlangenaugen-Pappel',
    'Spezialbeschwörung: Schlangenaugen-Pappel',
    'Linkbeschwörung: Zugangscode-Sprecher – Materialien: Schlangenaugen-Asche, Schlangenaugen-Pappel',
  ];
  for (let i = 0; i < expected.length; i++) {
    const options = page.locator('[data-testid^="quiz-option-"]');
    const texts = await options.allInnerTexts();
    const right = texts.findIndex((t) => t.includes(expected[i]));
    assert(right >= 0 && texts.length >= 3, `step ${i + 1}: correct answer among ${texts.length} options`);
    const pick = i === 1 ? texts.findIndex((t, k) => k !== right) : right;
    if (i === 1) await page.screenshot({ path: path.join(SHOTS, '18-combo-quiz.png') });
    await options.nth(pick).click();
    const feedback = await page.getByTestId('quiz-feedback').innerText();
    if (i === 1) {
      assert(feedback.includes('Falsch') && feedback.includes('Ash sucht Poplar.'), 'wrong answer marked and explained');
      await page.screenshot({ path: path.join(SHOTS, '19-combo-feedback.png') });
    }
    await page.getByTestId('quiz-next').click();
  }
  await page.getByTestId('quiz-summary').getByText(/Nächste Wiederholung: (?!…)/).waitFor();
  const summary = await page.getByTestId('quiz-summary').innerText();
  assert(summary.includes('3 von 4 Schritten richtig') && summary.includes('Morgen'), 'summary: 3/4 correct, next review tomorrow – ' + summary.split('\n').slice(0, 3).join(' | '));
  await page.screenshot({ path: path.join(SHOTS, '20-combo-summary.png') });
  await page.getByTestId('quiz-done').click();

  // Free quiz: first step by card + action, then give up
  // quiz-done navigates back asynchronously; let that finish before loading a new URL.
  await page.waitForURL(/\/combos\/(?!quiz)[^/]+$/);
  await page.goto(`${BASE}/combos`);
  await page.locator('[data-testid^="quiz-free-"]').first().click();
  await page.getByTestId('quiz-card-9674034').locator('[role="button"]').first().click();
  await page.getByTestId('quiz-action-normal_summon').click();
  await page.getByTestId('quiz-check').click();
  assert((await page.getByTestId('quiz-feedback').innerText()).includes('Richtig!'), 'free mode: card + action accepted');
  await page.getByTestId('quiz-next').click();
  await page.getByTestId('quiz-card-48452496').locator('[role="button"]').first().click();
  await page.getByTestId('quiz-action-search').click();
  await page.getByTestId('quiz-check').click();
  assert((await page.getByTestId('quiz-feedback').innerText()).includes('Richtige Aktion, falsche Karte'), 'free mode: partial answer explained');
  await page.getByTestId('quiz-next').click();
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('quiz-reveal').click();
    await page.getByTestId('quiz-next').click();
  }
  await page.getByTestId('quiz-summary').getByText(/Nächste Wiederholung: (?!…)/).waitFor();
  const freeSummary = await page.getByTestId('quiz-summary').innerText();
  assert(freeSummary.includes('1 von 4') && freeSummary.includes('Min.'), 'failed run is scheduled again within minutes');
  await page.getByTestId('quiz-done').click();
  await page.getByTestId('new-combo').waitFor();
  await page.waitForTimeout(300);
  const row = await page.locator('[data-testid^="combo-"]').first().innerText();
  assert(row.includes('2× geübt') && row.includes('1 schwieriger Schritt'), 'combo list shows practice stats and hard steps: ' + row.replace(/\n/g, ' '));
  await page.screenshot({ path: path.join(SHOTS, '21-combo-list.png') });

  // ---- Phase 4: puzzles -------------------------------------------------------------
  const drag = async (fromId, toId) => {
    const a = await page.getByTestId(fromId).first().boundingBox();
    const b = await page.getByTestId(toId).first().boundingBox();
    const [ax, ay, bx, by] = [a.x + a.width / 2, a.y + a.height / 2, b.x + b.width / 2, b.y + b.height / 2];
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(ax + ((bx - ax) * i) / 12, ay + ((by - ay) * i) / 12);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  const feedback = async () => (await page.getByTestId('puzzle-feedback').innerText()).replace(/\n/g, ' | ');
  const openPuzzle = async (id) => {
    await page.waitForTimeout(500); // let the attempt of the previous puzzle be stored
    await page.goto(`${BASE}/puzzles/${id}`);
    await page.getByTestId('duel-board').waitFor();
    await page.waitForTimeout(400);
  };

  await page.goto(`${BASE}/`);
  await page.getByTestId('tile-puzzles').click();
  await page.getByTestId('puzzle-rating').waitFor();
  assert((await page.locator('[data-testid^="puzzle-sample-"]').count()) === 5, 'five sample puzzles installed');
  assert((await page.getByTestId('puzzle-rating').innerText()).includes('1000'), 'puzzle rating starts at 1000');
  await page.getByTestId('daily-puzzle').waitFor();
  await page.screenshot({ path: path.join(SHOTS, '22-puzzles.png') });

  // Raigeki: a wrong move is rejected, then the solution is played by drag & drop.
  await page.getByTestId('puzzle-sample-raigeki').click();
  await page.getByTestId('duel-board').waitFor();
  await page.waitForTimeout(400);
  await drag('duel-card-89631139', 'zone-opp-monster-3');
  assert((await feedback()).includes('Nicht der gesuchte Zug'), 'wrong attack rejected');
  assert(/Rating \d+ \(-\d+\)/.test(await page.getByTestId('rating-change').innerText()), 'first mistake costs rating points');
  assert((await page.getByTestId('lp-opp-value').innerText()).startsWith('3000'), 'rejected move is not played');
  await drag('hand-me-12580477', 'zone-me-gy');
  await page.getByTestId('action-activate').click();
  assert((await feedback()).includes('Raigeki zerstört'), 'automatic follow-up moves are played and explained');
  await drag('duel-card-89631139', 'zone-opp-hand');
  await page.getByTestId('action-direct_attack').click();
  await page.getByTestId('puzzle-explanation').waitFor();
  assert((await page.getByTestId('lp-opp-value').innerText()).startsWith('0'), 'direct attack brings the opponent to 0 LP');
  await page.screenshot({ path: path.join(SHOTS, '23-puzzle-solved.png') });

  // Fusion: Extra Deck pile, material choice; a clean solve raises the rating.
  await openPuzzle('sample-fusion');
  await drag('hand-me-24094653', 'zone-me-gy');
  await page.getByTestId('action-activate').click();
  await page.getByTestId('pile-top-me-extra').click();
  await page.getByTestId('sheet-item-41462083').click();
  await page.getByTestId('action-fusion_summon').click();
  await page.getByTestId('sheet-item-71625222').click();
  await page.getByTestId('sheet-item-88819587').click();
  await page.getByTestId('sheet-confirm').click();
  assert((await feedback()).includes('Richtig'), 'fusion summon with chosen materials accepted');
  await drag('duel-card-41462083', 'zone-opp-hand');
  await page.getByTestId('action-direct_attack').click();
  await page.getByTestId('puzzle-explanation').waitFor();
  assert(/\(\+\d+\)/.test(await page.getByTestId('rating-change').innerText()), 'clean solve raises the rating');

  // Mirror Force: target choice; the two attacks may come in any order.
  await openPuzzle('sample-mirror-force');
  await drag('hand-me-5318639', 'zone-me-gy');
  await page.getByTestId('action-activate').click();
  await page.getByTestId('sheet-item-44095762').click();
  await page.getByTestId('sheet-confirm').click();
  assert((await feedback()).includes('Spiegelkraft wird zerstört'), 'targeted activation accepted, trap destroyed automatically');
  await drag('duel-card-91152256', 'zone-opp-hand');
  await page.getByTestId('action-direct_attack').click();
  assert((await feedback()).includes('Richtig'), 'second attacker may attack first');
  await drag('duel-card-46986414', 'zone-opp-hand');
  await page.getByTestId('action-direct_attack').click();
  await page.getByTestId('puzzle-explanation').waitFor();

  // Change of Heart: hint and step-by-step solution, then solved on a retry.
  await openPuzzle('sample-change-of-heart');
  await page.getByTestId('puzzle-hint').click();
  assert((await feedback()).includes('Tipp: Nutze Sinneswandel'), 'hint names the card to play');
  for (let i = 0; i < 6 && !(await page.getByTestId('puzzle-explanation').count()); i++) {
    await page.getByTestId('puzzle-reveal').click();
    await page.waitForTimeout(150);
  }
  assert((await page.getByTestId('lp-opp-value').innerText()).startsWith('0'), 'revealed solution plays to the end');
  await page.getByTestId('puzzle-restart').click();
  await drag('hand-me-4031928', 'zone-me-gy');
  await page.getByTestId('action-activate').click();
  await page.getByTestId('sheet-item-70781052').click();
  await page.getByTestId('sheet-confirm').click();
  assert((await feedback()).includes('übernimmst'), 'control change played automatically');
  await drag('duel-card-70781052', 'zone-opp-monster-1');
  assert((await feedback()).includes('Richtig'), 'attack on the set monster with the stolen monster (second solution)');
  await drag('duel-card-89631139', 'zone-opp-hand');
  await page.getByTestId('action-direct_attack').click();
  await page.getByTestId('puzzle-explanation').waitFor();

  // Ash Blossom: bait first, deck and GY viewers.
  await openPuzzle('sample-ash');
  await drag('hand-me-81439173', 'zone-me-gy');
  await page.getByTestId('action-activate').click();
  assert((await feedback()).includes('Nicht der gesuchte Zug'), 'running into Ash Blossom is wrong');
  await drag('hand-me-32807846', 'zone-me-gy');
  await page.getByTestId('action-activate').click();
  assert((await feedback()).includes('Ash Blossom ab'), 'opponent answers with Ash Blossom');
  await drag('hand-me-81439173', 'zone-me-gy');
  await page.getByTestId('action-activate').click();
  await page.getByTestId('pile-top-me-deck').click();
  await page.getByTestId('sheet-item-89631139').click();
  await page.getByTestId('action-send_gy').click();
  await drag('hand-me-83764718', 'zone-me-gy');
  await page.getByTestId('action-activate').click();
  await page.getByTestId('sheet-confirm').click();
  await page.getByTestId('pile-top-me-gy').click();
  await page.getByTestId('sheet-item-89631139').click();
  await page.getByTestId('action-ss_atk').click();
  assert((await feedback()).includes('Richtig'), 'monster special summoned from the GY viewer');
  await drag('duel-card-89631139', 'zone-opp-hand');
  await page.getByTestId('action-direct_attack').click();
  await page.getByTestId('puzzle-explanation').waitFor();
  await page.screenshot({ path: path.join(SHOTS, '24-puzzle-ash.png') });
  await page.waitForTimeout(500);

  await page.goto(`${BASE}/puzzles`);
  await page.getByTestId('puzzle-streak').waitFor();
  const streakText = await page.getByTestId('puzzle-streak').innerText();
  assert(/\b1\b/.test(streakText) && streakText.includes('5/5 gelöst'), 'all samples solved, daily streak 1: ' + streakText.replace(/\n/g, ' '));
  assert((await page.getByTestId('daily-puzzle').innerText()).includes('Heute gelöst'), 'daily puzzle marked as solved');

  // Editor: build a position, record a solution and test it.
  const pickSearch = async (query, id) => {
    await page.getByTestId('card-picker').waitFor();
    await page.getByTestId('picker-tab-search').click();
    await page.getByTestId('card-search-input').fill(query);
    await page.getByTestId(`picker-add-${id}`).click();
  };
  await page.getByTestId('puzzle-new').click();
  await page.getByTestId('dialog-input').fill('Mein Puzzle');
  await page.getByTestId('dialog-confirm').click();
  await page.waitForURL(/\/puzzles\/edit\//);
  await page.getByTestId('duel-board').waitFor();
  await page.getByTestId('zone-me-monster-0').click();
  await pickSearch('dunkler magier', 46986414);
  await page.getByTestId('zone-opp-monster-1').click();
  await pickSearch('maxx', 23434538);
  await page.getByTestId('zone-opp-hand').click();
  await pickSearch('nibiru', 27204311);
  await page.getByTestId('picker-done').click();
  await page.getByTestId('lp-input-opp').fill('2000');
  await drag('duel-card-23434538', 'zone-opp-monster-3');
  await page.getByTestId('mode-solutions').click();
  assert((await page.getByTestId('puzzle-problems').innerText()).includes('noch keine Lösung'), 'editor warns about a missing solution');
  await drag('duel-card-46986414', 'zone-opp-monster-3');
  assert((await page.getByTestId('recorded-move-0').innerText()).includes('-2000 LP'), 'attack recorded with battle damage');
  assert((await page.getByTestId('puzzle-problems').count()) === 0, 'puzzle is solvable after recording');
  await page.screenshot({ path: path.join(SHOTS, '25-puzzle-editor.png') });
  await page.getByTestId('editor-test').click();
  await page.waitForURL(/\/puzzles\/(?!edit)[^/]+$/);
  await page.getByTestId('duel-board').waitFor();
  await page.waitForTimeout(300);
  await drag('duel-card-46986414', 'zone-opp-monster-3');
  assert((await feedback()).includes('Gelöst'), 'own puzzle solvable');
  await page.waitForTimeout(500);

  // Share and import as puzzle code.
  await page.goto(`${BASE}/puzzles`);
  const ownRow = page.locator('[data-testid^="puzzle-"]').filter({ hasText: 'Mein Puzzle' }).last();
  await ownRow.locator('[data-testid^="puzzle-more-"]').click();
  await page.getByTestId('puzzle-action-share').click();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  assert(code.startsWith('ygo-puzzle:') && code.includes('Mein Puzzle'), 'puzzle code copied');
  await page.getByTestId('puzzle-import').click();
  await page.getByTestId('dialog-input').fill(code);
  await page.getByTestId('dialog-confirm').click();
  await page.getByText('„Mein Puzzle“ importiert').waitFor();
  const rows = await page.locator('[data-testid^="puzzle-"]').filter({ hasText: 'Mein Puzzle' }).filter({ hasText: 'Rating' }).allInnerTexts();
  assert(rows.length === 2 && rows.some((r) => r.includes('Importiert')), 'imported puzzle listed next to the original');

  // ---- Phase 5: duel against the AI with the rules engine ---------------------------
  const passChains = async () => {
    // The random hand can lead to engine questions: pass chain chances and optional effects,
    // otherwise take the first option (position, zone, number, card selection).
    for (const id of ['chain-pass', 'prompt-no', 'option-0', 'place-0', 'number-0']) {
      if (await page.getByTestId(id).count()) return page.getByTestId(id).click();
    }
    const position = page.locator('[data-testid^="position-"]');
    if (await position.count()) return position.first().click();
    if (await page.getByTestId('instance-sheet').count()) {
      const items = page.locator('[data-testid^="sheet-item-"]');
      for (let i = 0; i < (await items.count()) && !(await page.getByTestId('sheet-confirm').isEnabled()); i++) await items.nth(i).click();
      if (await page.getByTestId('sheet-confirm').isEnabled()) await page.getByTestId('sheet-confirm').click();
    }
  };
  const endTurn = async () => {
    for (let i = 0; i < 60 && !(await page.getByTestId('phase-to-ep').count()); i++) {
      await passChains();
      await page.waitForTimeout(500);
    }
    await page.getByTestId('phase-to-ep').click();
  };
  await page.goto(`${BASE}/`);
  await page.getByTestId('tile-duel').click();
  await page.getByTestId('duel-start').waitFor();
  await page.screenshot({ path: path.join(SHOTS, '26-duel-setup.png') });
  await page.getByTestId('first-me').click();
  await page.getByTestId('duel-start').click();
  await page.getByTestId('duel-board').waitFor({ timeout: 60000 });
  await page.getByTestId('duel-turn').getByText(/Zug 1 · Du/).waitFor({ timeout: 30000 });
  assert(mock.state.github.some((u) => u.endsWith('/BabelCDB/master/cards.cdb')), 'rules database loaded from EDOPro (BabelCDB)');
  assert(mock.state.github.some((u) => u.endsWith('/CardScripts/master/utility.lua')), 'card scripts loaded from EDOPro (CardScripts)');
  assert((await page.locator('[data-testid^="hand-me-"]').count()) === 5, 'opening hand: 5 cards');
  assert((await page.locator('[data-testid^="hand-opp-"]').count()) === 5, 'the AI hand is shown face down');
  const myHand = page.locator('[data-testid^="hand-me-"]');
  let played = false;
  for (let i = 0; i < 5 && !played; i++) {
    await myHand.nth(i).click();
    await page.waitForTimeout(300);
    for (const kind of ['summon', 'mset', 'sset']) {
      const action = page.getByTestId(`engine-action-${kind}`);
      if (!played && (await action.count())) {
        await action.click();
        played = true;
      }
    }
    if (!played) {
      if (await page.getByTestId('dialog-cancel').count()) await page.getByTestId('dialog-cancel').click();
      if (await page.getByTestId('card-detail').count()) await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }
  assert(played, 'a card from the hand was summoned or set via the engine');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, '27-duel-my-turn.png') });
  await endTurn();
  for (let i = 0; i < 180 && !(await page.getByTestId('duel-turn').innerText()).startsWith('Zug 3 · Du'); i++) {
    if (await page.getByTestId('duel-result').count()) break;
    await passChains();
    await page.waitForTimeout(500);
  }
  const duelLog = await page.getByTestId('duel-log').innerText();
  assert(/ZUG 2: ZUG DES GEGNERS/i.test(duelLog), 'the AI played its turn');
  await page.screenshot({ path: path.join(SHOTS, '28-duel-after-ai.png') });
  if (!(await page.getByTestId('duel-result').count())) {
    await page.getByTestId('duel-surrender').click();
    await page.getByTestId('dialog-confirm').click();
  }
  await page.getByTestId('duel-result').waitFor({ timeout: 30000 });
  assert(/Verloren|Gewonnen/.test(await page.getByTestId('duel-result').innerText()), 'the duel ended');
  await page.waitForTimeout(500);
  // ---- Phase 6: analysis – statistics, replay viewer, AI commentary -------------------
  await page.goto(`${BASE}/`);
  await page.getByTestId('tile-analysis').click();
  await page.getByTestId('overall-stats').waitFor();
  assert((await page.getByTestId('overall-stats').innerText()).includes('DUELLE\n1'), 'overall statistics count the duel');
  await page.screenshot({ path: path.join(SHOTS, '30-analysis-overall.png') });
  await page.getByTestId('tab-replays').click();
  await page.locator('[data-testid^="replay-"]').first().click();
  await page.getByTestId('replay-turn').getByText(/^Zug 1/).waitFor({ timeout: 60000 });
  await page.getByTestId('replay-log').waitFor();
  assert((await page.getByTestId('replay-turn').innerText()).includes('Zug 1 · Du'), 'replay starts at your first turn');
  const logAtStart = (await page.getByTestId('replay-log').innerText()).split('\n').length;
  await page.getByTestId('replay-turn-2').click();
  await page.getByTestId('replay-turn').getByText(/^Zug 2 · Gegner/).waitFor();
  assert((await page.getByTestId('replay-log').innerText()).split('\n').length > logAtStart, 'the log follows the replay');
  await page.getByTestId('replay-next').click();
  await page.waitForTimeout(300);
  const hidden = await page.locator('[data-testid^="hand-opp-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  await page.getByTestId('replay-reveal').click();
  await page.waitForTimeout(400);
  const revealed = await page.locator('[data-testid^="hand-opp-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  assert(hidden.every((id) => id.endsWith('-0')) && revealed.length > 0 && revealed.every((id) => !id.endsWith('-0')), 'the AI hand can be revealed in the replay');
  await page.screenshot({ path: path.join(SHOTS, '31-replay-viewer.png') });
  await page.getByTestId('replay-end').click();
  await page.waitForTimeout(400);
  assert(/Du hast verloren|Du hast gewonnen/.test(await page.getByTestId('replay-log').innerText()), 'replay plays to the end of the duel');
  await page.getByTestId('tab-stats').click();
  await page.getByTestId('match-stats').waitFor();
  await page.getByTestId('lp-table-toggle').click();
  assert((await page.getByTestId('lp-table').innerText()).includes('Start'), 'LP per turn as a table');
  await page.screenshot({ path: path.join(SHOTS, '32-match-stats.png') });

  // AI commentary: no key yet → settings; an invalid key is rejected, a valid one stored.
  await page.getByTestId('tab-ai').click();
  await page.getByTestId('analysis-settings').click();
  await page.getByTestId('claude-key-input').fill('sk-ant-invalid-key');
  await page.getByTestId('claude-key-save').click();
  await page.getByTestId('claude-error').getByText(/ungültig/).waitFor();
  assert(true, 'an invalid API key is rejected');
  await page.getByTestId('claude-key-input').fill('sk-ant-test-key-1234');
  await page.getByTestId('claude-key-save').click();
  await page.getByTestId('claude-key-status').waitFor();
  assert((await page.getByTestId('claude-panel').innerText()).includes('Modell: Mock Opus'), 'API key stored, newest Opus model chosen');
  await page.goBack();
  await page.getByTestId('analysis-request').click();
  await page.getByTestId('analysis-result').waitFor({ timeout: 60000 });
  const request = mock.state.claude.find((c) => c.path === '/v1/messages');
  assert(request && request.body.model === 'mock-opus-model' && request.body.fallbacks === 'default' && request.body.output_config.format.type === 'json_schema', 'commentary requested with structured output');
  const promptText = request.body.messages[0].content;
  assert(promptText.includes('## E1 ') && promptText.includes('Gewählt:') && promptText.includes('[E1] deine Entscheidung'), 'prompt lists the decisions with their options');
  const analysisText = await page.getByTestId('analysis-result').innerText();
  assert(analysisText.includes('Mehr Druck in Zug 1') && analysisText.includes('Spiele deine Starter früh aus.'), 'commentary shown');
  assert(/Engine: (erlaubt|gewinnt)/.test(analysisText), 'suggested move checked by the rules engine');
  assert(analysisText.includes('passten zu keinem erlaubten Zug'), 'invalid suggestions are filtered out');
  await page.screenshot({ path: path.join(SHOTS, '33-ai-commentary.png') });
  await page.goto(`${BASE}/replays`);
  await page.getByTestId('tab-replays').click();
  assert((await page.locator('[data-testid^="replay-"]').first().innerText()).includes('KI-Kommentar'), 'the commentary is stored with the replay');

  // Puzzles with the real rules: Raigeki lethal, and the AI answers with Ash Blossom.
  await page.goto(`${BASE}/puzzles/sample-raigeki`);
  await page.getByTestId('puzzle-engine').click();
  await page.getByTestId('duel-board').waitFor({ timeout: 60000 });
  await page.getByTestId('hand-me-12580477').waitFor();
  await page.waitForTimeout(500);
  await page.getByTestId('hand-me-12580477').click();
  await page.getByTestId('engine-action-activate').click();
  await page.getByTestId('phase-to-bp').waitFor({ timeout: 30000 });
  await page.getByTestId('phase-to-bp').click();
  await page.waitForTimeout(600);
  await drag('duel-card-89631139', 'zone-opp-hand');
  await page.getByTestId('duel-result').waitFor({ timeout: 30000 });
  assert((await page.getByTestId('duel-result').innerText()).includes('Puzzle gelöst'), 'puzzle solved under the real rules');
  await page.screenshot({ path: path.join(SHOTS, '29-puzzle-rules.png') });
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/puzzles/sample-ash`);
  await page.getByTestId('puzzle-engine').click();
  await page.getByTestId('duel-board').waitFor({ timeout: 60000 });
  await page.getByTestId('hand-me-32807846').waitFor();
  await page.waitForTimeout(500);
  await page.getByTestId('hand-me-32807846').click();
  await page.getByTestId('engine-action-activate').click();
  await page.getByTestId('duel-log').getByText(/annulliert/).waitFor({ timeout: 30000 });
  assert((await page.getByTestId('duel-log').innerText()).includes('Gegner aktiviert Aschblüte'), 'the AI answers the search with Ash Blossom');

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
  await p2.getByTestId('card-search-input').fill('zugangscode');
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
