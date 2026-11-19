import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as search from '../search-policy.js';
import { createPresetStore, PRESET_KEY } from '../parameter-presets.js';

const candidate = (height, options = {}) => ({ validation: { valid: true, metrics: {
  placed_parts: 4, placed_priority: 4, placed_area: 400, sheets_used: 1, last_sheet_used_height: height, ...options
} } });

test('only better validated layouts restart the inactivity clock', () => {
  const policy = search.createImprovementTracker('all');
  assert.equal(policy.stalled(60000), false);
  const first = candidate(200);
  policy.consider(first, 60000);
  policy.consider(candidate(205), 70000);
  policy.consider(candidate(199.99), 73000);
  policy.consider({ validation: { valid: false } }, 74000);
  assert.equal(policy.best, first);
  assert.equal(policy.stalled(74999), false);
  assert.equal(policy.stalled(75000), true);
  const compact = candidate(190);
  policy.consider(compact, 74500);
  assert.equal(policy.best, compact);
  assert.equal(policy.stalled(75000), false);
  assert.equal(policy.stalled(89500), true);
});

test('placing more parts wins before compactness; fewer sheets win for equivalent placement', () => {
  const policy = search.createImprovementTracker('all');
  policy.consider(candidate(50), 0);
  const more = candidate(150, { placed_parts: 5, placed_priority: 5, sheets_used: 3 });
  policy.consider(more, 1);
  assert.equal(policy.best, more);
  const fewerSheets = candidate(300, { placed_parts: 5, placed_priority: 5, sheets_used: 2 });
  policy.consider(fewerSheets, 2);
  assert.equal(policy.best, fewerSheets);
});

test('area mode prefers more placed area even with fewer pieces', () => {
  const policy = search.createImprovementTracker('fill_area');
  policy.consider(candidate(100), 0);
  const larger = candidate(120, { placed_parts: 2, placed_area: 450 });
  policy.consider(larger, 1);
  assert.equal(policy.best, larger);
});

test('validates the latest preview after draining the old queue', async () => {
  const tracker = search.createImprovementTracker('all');
  tracker.consider(candidate(200), 0);
  let latest = candidate(220);
  const queued = Promise.withResolvers();
  const verdict = search.confirmStagnation(tracker, {
    queued: queued.promise, latest: () => latest, active: () => true, now: () => 15000,
    validate: async item => { item.validation = item.expectedValidation; tracker.consider(item, 15000); }
  });
  const better = candidate(180);
  latest = { expectedValidation: better.validation };
  queued.resolve();
  assert.equal(await verdict, false);
  assert.equal(tracker.best, latest);
  assert.equal(tracker.stalled(29999), false);
});

test('loading and re-saving a legacy full-sheet preset leaves its dimensions and time intact', () => {
  const defaults = {'sheet-width':'1200', 'sheet-height':'2400', spacing:'10', margin:'0', 'time-unlimited':true, 'time-budget':'10'};
  const legacy = {'sheet-width':'1220', 'sheet-height':'2440', spacing:'3', margin:'5', 'time-budget':'45'};
  const schema = Object.fromEntries(Object.keys(defaults).map(key => [key, key === 'time-unlimited' ? {type:'checkbox'} : {type:'number'}]));
  const data = new Map([[PRESET_KEY, JSON.stringify({version:2, selectedId:'3', items:[{id:'3', name:'Полный лист', builtin:true, settings:legacy}]})]]);
  const storage = {getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value)};
  const store = createPresetStore({defaults, schema, storage});
  assert.equal(store.error, null);
  store.save(store.items, store.selectedId);
  assert.deepEqual(JSON.parse(data.get(PRESET_KEY)).items[0].settings, {...legacy, 'time-unlimited':false});
});
