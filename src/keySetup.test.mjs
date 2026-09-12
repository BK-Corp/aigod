import test from 'node:test';
import assert from 'node:assert/strict';
import { initI18n } from './i18n.js';
import {
  collectKeyUpdates,
  keySetupChipLabel,
  stripKeylessBasemapFromHash,
} from './keySetup.js';

// The chip label is driven by i18n; prime the module before asserting.
await initI18n();

test('the chip counts what is missing, and retires the count at zero', () => {
  // Vietnamese is the default locale, so the chip renders in Vietnamese.
  assert.equal(keySetupChipLabel({ setCount: 0, total: 8 }), 'POWER UP · 8 KHÓA CHỜ');
  assert.equal(keySetupChipLabel({ setCount: 7, total: 8 }), 'POWER UP · 1 KHÓA CHỜ');
  assert.equal(keySetupChipLabel({ setCount: 8, total: 8 }), 'ĐÃ CẤP SỨC');
  assert.equal(keySetupChipLabel(null), 'ĐÃ CẤP SỨC', 'no status is not a broken label');
});

test('collectKeyUpdates keeps only non-empty trimmed values', () => {
  const updates = collectKeyUpdates([
    { envVar: 'OPENAI_API_KEY', value: '  sk-abc  ' },
    { envVar: 'FIRMS_MAP_KEY', value: '' },
    { envVar: 'TOMTOM_API_KEY', value: '   ' },
    { envVar: '', value: 'orphan' },
    null,
  ]);
  assert.deepEqual(updates, { OPENAI_API_KEY: 'sk-abc' });
  assert.deepEqual(collectKeyUpdates([]), {});
  assert.deepEqual(collectKeyUpdates(null), {});
});

test('the first Google key strips ONLY the keyless OSM basemap from the share hash', () => {
  const stripped = stripKeylessBasemapFromHash('lat=30.2&lon=-97.7&map=osm&style=normal');
  assert.ok(stripped !== null);
  const params = new URLSearchParams(stripped);
  assert.equal(params.get('map'), null, 'osm basemap removed');
  assert.equal(params.get('lat'), '30.2', 'camera survives');
  assert.equal(params.get('style'), 'normal', 'style survives');
  // A stack under any other name was chosen or shared on purpose.
  assert.equal(stripKeylessBasemapFromHash('map=bing-aerial&lat=1'), null);
  assert.equal(stripKeylessBasemapFromHash('lat=1&lon=2'), null, 'no stack, nothing to do');
  assert.equal(stripKeylessBasemapFromHash(''), null);
  assert.equal(stripKeylessBasemapFromHash(undefined), null);
});
