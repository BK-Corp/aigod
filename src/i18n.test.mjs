import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { initI18n, t, currentLanguage, setLanguage, translateDom } from './i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(root, 'src', 'locales');

function loadLocale(lng) {
  return JSON.parse(readFileSync(path.join(localesDir, lng, 'translation.json'), 'utf8'));
}

/** Flatten nested locale objects into dot-namespaced keys. */
function flattenLocale(obj, prefix = '', out = {}) {
  for (const [name, value] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (value && typeof value === 'object') flattenLocale(value, key, out);
    else out[key] = value;
  }
  return out;
}

/** Minimal document stand-in for the DOM walk. */
function makeDocument(elements = []) {
  const listeners = {};
  return {
    documentElement: { lang: '' },
    querySelector(sel) {
      return elements.find((el) => el.matches(sel)) || null;
    },
    querySelectorAll(sel) {
      return elements.filter((el) => el.matches(sel));
    },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
  };
}

function makeElement(attrs = {}) {
  return {
    _attrs: { ...attrs },
    _text: '',
    getAttribute(name) { return this._attrs[name] ?? null; },
    setAttribute(name, value) { this._attrs[name] = String(value); },
    removeAttribute(name) { delete this._attrs[name]; },
    hasAttribute(name) { return name in this._attrs; },
    get textContent() { return this._text; },
    set textContent(value) { this._text = String(value); },
    get innerHTML() { return this._text; },
    set innerHTML(value) { this._text = String(value); },
    matches(sel) {
      if (sel === '[data-i18n]') return 'data-i18n' in this._attrs;
      if (sel === '[data-i18n-attr]') return 'data-i18n-attr' in this._attrs;
      if (sel.startsWith('[data-i18n=')) {
        const key = sel.slice('[data-i18n='.length, -1);
        return this._attrs['data-i18n'] === key;
      }
      if (sel.startsWith('[data-i18n-attr=')) {
        const key = sel.slice('[data-i18n-attr='.length, -1);
        return this._attrs['data-i18n-attr'] === key;
      }
      return false;
    },
  };
}

await initI18n();

test('default locale is Vietnamese and stays after init', () => {
  assert.equal(currentLanguage(), 'vi');
});

test('every data-i18n key in the markup exists in both locale files', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const keys = new Set();
  const attrRe = /data-i18n-attr="([^"]+)"/g;
  const textRe = /data-i18n="([^"]+)"/g;
  let m;
  while ((m = textRe.exec(html))) keys.add(m[1]);
  while ((m = attrRe.exec(html))) {
    for (const pair of m[1].split(',')) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const sep = trimmed.indexOf(':');
      const key = sep >= 0 ? trimmed.slice(sep + 1).trim() : trimmed;
      if (key) keys.add(key);
    }
  }
  assert.ok(keys.size > 0, 'expected at least one data-i18n key in index.html');
  const en = flattenLocale(loadLocale('en'));
  const vi = flattenLocale(loadLocale('vi'));
  const missing = [];
  for (const key of keys) {
    if (!(key in en)) missing.push(`en missing: ${key}`);
    if (!(key in vi)) missing.push(`vi missing: ${key}`);
  }
  assert.deepEqual(missing, [], `every tagged key must exist in both locales; ${missing.join(', ')}`);
});

test('English is the source of truth and falls back for any missing vi key', () => {
  const en = flattenLocale(loadLocale('en'));
  const vi = flattenLocale(loadLocale('vi'));
  for (const [key, value] of Object.entries(en)) {
    assert.equal(typeof value, 'string', `en.${key} must be a string`);
  }
  // i18next falls back to `en` for any key absent from `vi`.
  for (const [key, value] of Object.entries(en)) {
    if (!(key in vi)) {
      assert.equal(t(key), value, `missing vi key must fall back to en (${key})`);
    }
  }
});

test('switching locale re-labels the DOM walk', async () => {
  const el = makeElement({ 'data-i18n': 'title' });
  const doc = makeDocument([el]);
  translateDom(doc);
  assert.equal(el.textContent, loadLocale('vi').title);
  await setLanguage('en', doc);
  assert.equal(el.textContent, loadLocale('en').title);
  await setLanguage('vi', doc);
  assert.equal(el.textContent, loadLocale('vi').title);
});

test('data-i18n-attr translates an attribute value', () => {
  const el = makeElement({ 'data-i18n-attr': 'title:title' });
  const doc = makeDocument([el]);
  translateDom(doc);
  assert.equal(el.getAttribute('title'), loadLocale('vi').title);
});

test('unsupported language falls back to the default', async () => {
  await setLanguage('fr');
  assert.equal(currentLanguage(), 'vi');
});

test('interpolation placeholders work', () => {
  assert.match(t('worldOverlay.focusing', { label: 'ISS' }), /ISS/);
});

test('supported locales are vi and en only', () => {
  assert.deepEqual(
    readdirSync(localesDir).sort(),
    ['en', 'vi'],
  );
});