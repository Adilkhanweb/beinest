// Preset-only regression: no engine search, import, network fixtures or new dependencies.
// Serve with node scripts/serve.mjs; honors TEST_URL, CHROME_PATH and PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath, 'Set CHROME_PATH');
const browser = await chromium.launch({ headless: true, executablePath });
const base = process.env.TEST_URL || `http://127.0.0.1:${process.env.TEST_PORT || 4175}`;
const key = 'nestbolt-saved-parameters-v2', oldParameters = 'nestbolt-parameter-presets-v1', oldSheets = 'beinest-sheet-presets-v1';
const errors = [];
const report = { status: 'running', errors, checks: ['Full add/edit/apply/delete cycle', 'Exact restoration of every captured setting, including inactive controls and seconds', 'Comparison-based dirty/save baseline', 'Two-row RU/EN/KK summary and mobile editor', 'Non-destructive migration of both legacy libraries', 'Empty libraries remain empty', 'Corrupt and invalid records are never overwritten'] };
async function fresh(seed) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  if (seed) await context.addInitScript(({ entries }) => { if (!sessionStorage.getItem('preset-test-seeded')) { for (const [key, value] of entries) localStorage.setItem(key, value); sessionStorage.setItem('preset-test-seeded', '1'); } }, { entries: Object.entries(seed) });
  const page = await context.newPage(); page.setDefaultTimeout(7000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base); await page.waitForSelector('#parameter-preset');
  return { context, page };
}
const read = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const capture = page => page.evaluate(() => document.getElementById('settings-content').nestboltSettings.capture());
try {
  const { context, page } = await fresh();
  const initial = await capture(page), defaults = await read(page);
  assert.equal(defaults.items.length, 4); assert.ok(defaults.items.every(item => Object.keys(item.settings).length === Object.keys(initial).length));
  assert.equal(await page.locator('select#parameter-preset,#apply-parameter-preset,#delete-parameter-preset').count(), 0);
  assert.equal(await page.locator('#settings-content > :first-child').getAttribute('id'), 'parameter-preset');
  assert.equal(await page.locator('#save-parameter-preset').isVisible(), false);
  await page.locator('#spacing').fill('7.25');
  assert.equal(await page.locator('#save-parameter-preset').isVisible(), true);
  await page.locator('#spacing').fill(initial.spacing);
  assert.equal(await page.locator('#save-parameter-preset').isVisible(), false);
  await page.locator('#material-presets').click();
  assert.equal(await page.locator('.preset-grid.management-presets .management-preset .preset-card').count(), 4);
  await page.locator('#add-parameter-preset').click();
  assert.equal(await page.locator('.preset-editor-fields input,.preset-editor-fields select').count(), Object.keys(initial).length);
  await page.locator('#parameter-preset-name').fill('Complete parameters');
  await page.locator('#preset-sheet-width').fill('850'); await page.locator('#preset-sheet-height').fill('650');
  await page.locator('#preset-spacing').fill('4.75'); await page.locator('#preset-margin').fill('9');
  await page.locator('#preset-rotation').selectOption('free'); await page.locator('#preset-time-budget').fill('73');
  await page.locator('#preset-edge-unlinked').check(); await page.locator('#preset-edge-spacing').fill('13');
  await page.locator('#preset-allow-mirror').check(); await page.locator('#preset-sheet-count').fill('12');
  await page.locator('#preset-nest-mode').selectOption('fill_area'); await page.locator('#preset-run-seed').fill('987');
  await page.locator('#preset-common-line-enabled').check(); await page.locator('#preset-common-line-kerf').fill('0.25');
  await page.locator('#preset-common-line-search-bonus').check(); await page.locator('#preset-lead-in-enabled').check();
  await page.locator('#preset-lead-in-kerf').fill('0.3'); await page.locator('#preset-lead-in-length').fill('6');
  await page.locator('#preset-lead-in-style').selectOption('arc'); await page.locator('#preset-lead-in-outer-angle').fill('30');
  await page.locator('#preset-lead-in-hole-angle').fill('60'); await page.locator('#preset-run-repeatable').check();
  await page.locator('#preset-quick-start').uncheck(); await page.locator('#preset-import-tolerance').fill('0.02');
  await page.locator('#preset-import-close-gaps').check(); await page.locator('#preset-import-gap-limit').fill('0.65');
  await page.locator('#preset-import-dxf-unit').selectOption('inch'); await page.locator('#save-preset').click();
  let record = (await read(page)).items.find(item => item.name === 'Complete parameters'); assert.ok(record);
  assert.deepEqual(await capture(page), initial, 'Editing a record does not silently apply it');
  await page.locator(`[data-preset="${record.id}"]`).click();
  assert.deepEqual(await capture(page), record.settings, 'Applying restores every captured field, including hidden/disabled fields');
  assert.equal(await page.locator('#time-output').inputValue(), '73');
  assert.equal(await page.locator('#preset-allow-holes').count(), 0, 'Editor closes on apply');
  await page.evaluate(() => document.getElementById('settings-content').nestboltSettings.apply({ 'time-budget': '74', 'lead-in-length': '8' }));
  assert.equal(await page.locator('#save-parameter-preset').isVisible(), true);
  await page.locator('#save-parameter-preset').click(); record = (await read(page)).items.find(item => item.id === record.id);
  assert.equal(record.settings['time-budget'], '74'); assert.equal(record.settings['lead-in-length'], '8');
  assert.equal(await page.locator('#save-parameter-preset').isVisible(), false);
  await page.locator('#material-presets').click(); await page.locator(`[data-edit-preset="${record.id}"]`).click();
  await page.locator('#parameter-preset-name').fill('Renamed parameters'); await page.locator('#preset-time-budget').fill('81'); await page.locator('#save-preset').click();
  assert.equal((await read(page)).items.find(item => item.id === record.id).name, 'Renamed parameters');
  await page.locator(`[data-preset="${record.id}"]`).click(); assert.equal(await page.locator('#time-output').inputValue(), '81');
  await page.reload(); assert.equal(await page.locator('#time-output').inputValue(), '10', 'Reload never auto-applies presets');
  for (const lang of ['ru', 'en', 'kk']) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 }); await page.locator('#language-select').selectOption(lang);
    const bounds = await page.locator('#parameter-preset').boundingBox(); assert.ok(bounds.height <= 62, `Compact at ${lang}/${width}: ${bounds.height}`);
    assert.equal(await page.locator('.parameter-preset-name').evaluate(el => getComputedStyle(el).whiteSpace), 'nowrap');
    await page.locator('#material-presets').click(); assert.equal(await page.locator('.preset-card').count(), 5); await page.locator('#dialog-close').click();
  }
  // Reopen a fully populated editor in each locale/mobile width, including localized labels.
  for (const lang of ['ru', 'en', 'kk']) {
    await page.locator('#language-select').selectOption(lang); await page.locator('#material-presets').click();
    await page.locator(`[data-edit-preset="${record.id}"]`).click();
    assert.equal(await page.locator('#preset-allow-holes').isDisabled(), true, 'Unsupported worker option remains read-only');
    assert.equal(await page.locator('#preset-time-budget').inputValue(), '81');
    assert.equal(await page.locator('#preset-lead-in-kerf').inputValue(), '0.3', 'Inactive values survive complete capture/apply');
    assert.equal(await page.locator('#parameter-preset-form').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `Editor fits ${lang}/390`);
    await page.locator('#dialog-close').click();
  }
  await page.locator('#material-presets').click(); await page.locator(`[data-delete-preset="${record.id}"]`).click(); await page.locator('#confirm-delete').click();
  assert.equal((await read(page)).items.some(item => item.id === record.id), false); await context.close();
  const migratedSeed = { [oldParameters]: JSON.stringify([{ id: 'legacy-full', name: 'Legacy full', settings: { ...initial, spacing: '8', 'time-budget': '92' } }]), [oldSheets]: JSON.stringify({ version: 1, items: [{ id: 'legacy-size', name: 'Legacy size', w: 750, h: 500 }] }) };
  const migrated = await fresh(migratedSeed); const records = (await read(migrated.page)).items;
  assert.equal(records.length, 2); assert.equal(records.find(item => item.id === 'legacy-full').settings['time-budget'], '92');
  assert.equal(records.find(item => item.id === 'legacy-size').settings['sheet-width'], '750');
  for (const [legacyKey, value] of Object.entries(migratedSeed)) assert.equal(await migrated.page.evaluate(key => localStorage.getItem(key), legacyKey), value, 'Legacy bytes retained');
  await migrated.page.reload(); assert.equal((await read(migrated.page)).items.length, 2, 'Migration runs once'); await migrated.context.close();
  for (const seed of [{ [oldParameters]: '[]' }, { [oldSheets]: '{"version":1,"items":[]}' }, { [key]: '{"version":2,"items":[],"selectedId":null}' }]) {
    const empty = await fresh(seed); assert.equal((await read(empty.page)).items.length, 0, 'Explicit empty library is never reseeded');
    await empty.page.locator('#spacing').fill('6'); assert.equal(await empty.page.locator('#save-parameter-preset').isVisible(), true, 'Unselected baseline recognizes first change'); await empty.context.close();
  }
  for (const seed of [{ [oldParameters]: '{broken' }, { [oldSheets]: '{"version":1,"items":[{"id":"bad","name":"Bad","w":-1,"h":600}]}' }, { [key]: '{"version":2,"items":[{}],"selectedId":null}' }, { [oldParameters]: JSON.stringify([{ id: 'bad', name: 'Bad', settings: { ...initial, 'time-budget': '301' } }]) }, { [oldParameters]: JSON.stringify([{ id: 'bad', name: 'Bad', settings: { ...initial, unexpected: true } }]) }]) {
    const corrupt = await fresh(seed); await corrupt.page.locator('#material-presets').click(); assert.ok(await corrupt.page.locator('#management-error').textContent());
    for (const [storedKey, value] of Object.entries(seed)) assert.equal(await corrupt.page.evaluate(key => localStorage.getItem(key), storedKey), value);
    if (!Object.hasOwn(seed, key)) assert.equal(await corrupt.page.evaluate(key => localStorage.getItem(key), key), null, 'No destructive migration after corruption');
    await corrupt.context.close();
  }
  assert.deepEqual(errors, []); report.status = 'passed'; console.log('PASS presets: full CRUD, exact apply, dirty baselines, migration, corruption protection, RU/EN/KK mobile two-row summary');
} catch (error) { report.status = 'failed'; report.failure = error.stack; throw error; }
finally {
  await browser.close();
  const out = new URL('../test-results/', import.meta.url); await mkdir(out, { recursive: true });
  await writeFile(new URL('parameter-presets-report.json', out), JSON.stringify(report, null, 2));
}