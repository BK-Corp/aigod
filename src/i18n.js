/**
 * i18next-backed localization layer for God's Eye View.
 *
 * Vietnamese (`vi`) is the DEFAULT language for every first visit. An explicit
 * choice made with the language switcher is persisted in `localStorage` under
 * `i18nextLng`, so the app remembers it on the next load. English (`en`) is the
 * source of truth: any key missing from the active locale falls back to it.
 *
 * The module exposes a single `t()` facade (i18next's `t` bound to the active
 * instance) plus helpers for the DOM walk and the language switcher. Importing
 * this module has the side effect of initializing i18next; the returned promise
 * resolves only after the first locale is loaded, so callers that paint text
 * immediately can await it.
 */

import i18next from 'i18next';
import en from './locales/en/translation.json' with { type: 'json' };
import vi from './locales/vi/translation.json' with { type: 'json' };

/** Supported locales. `vi` is first: it is the default. */
export const SUPPORTED_LANGUAGES = Object.freeze(['vi', 'en']);
export const DEFAULT_LANGUAGE = 'vi';

/** localStorage key used to remember an explicit language choice. */
export const I18N_STORAGE_KEY = 'i18nextLng';

/** DOM attribute that marks a translatable text node. */
export const I18N_TEXT_ATTR = 'data-i18n';
/** DOM attribute that marks an element whose attribute should be translated. */
export const I18N_ATTR_ATTR = 'data-i18n-attr';

/** Bundled locale resources. `en` is the source of truth; `vi` carries the
 *  per-locale overrides and falls back to `en` for any key it lacks. */
export const I18N_RESOURCES = Object.freeze({
  en: { translation: en },
  vi: { translation: vi },
});

let _initialized = false;
let _initPromise = null;

/** Normalize any language tag (`en-US`, `vi_VN`) to a supported base code. */
function normalizeLanguage(language) {
  const base = String(language || '').trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : DEFAULT_LANGUAGE;
}

/** Read a previously chosen locale from storage, or `null` when none applies. */
function readStoredLanguage(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(I18N_STORAGE_KEY);
    if (!raw) return null;
    const base = String(raw).trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED_LANGUAGES.includes(base) ? base : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a translation. Before i18next is initialized (a module evaluated
 * during import, before `initI18n()` runs) the raw key is returned, unless a
 * `defaultValue` is supplied — that lets module-level constants keep an English
 * display fallback instead of leaking a key into the UI.
 * @param {string} key
 * @param {object} [options]
 * @returns {string}
 */
export function t(key, options) {
  if (!_initialized) {
    return options && Object.prototype.hasOwnProperty.call(options, 'defaultValue')
      ? options.defaultValue
      : key;
  }
  return i18next.t(key, options);
}

/**
 * Walk the live DOM and translate every element carrying `data-i18n` /
 * `data-i18n-attr`. Safe to call repeatedly; already-translated nodes are
 * re-translated so a locale switch re-labels them.
 * @param {Document} [documentRef]
 * @returns {number} Number of `data-i18n` elements translated.
 */
export function translateDom(documentRef = globalThis.document) {
  if (!_initialized || !documentRef) return 0;
  let count = 0;
  const textNodes = documentRef.querySelectorAll(`[${I18N_TEXT_ATTR}]`);
  for (const node of textNodes) {
    const key = node.getAttribute(I18N_TEXT_ATTR);
    if (!key) continue;
    node.textContent = t(key);
    count++;
  }
  const attrNodes = documentRef.querySelectorAll(`[${I18N_ATTR_ATTR}]`);
  for (const node of attrNodes) {
    const mapping = node.getAttribute(I18N_ATTR_ATTR);
    if (!mapping) continue;
    for (const pair of mapping.split(',')) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const sep = trimmed.indexOf(':');
      const attrName = sep >= 0 ? trimmed.slice(0, sep).trim() : trimmed;
      const key = sep >= 0 ? trimmed.slice(sep + 1).trim() : trimmed;
      if (!attrName || !key) continue;
      const value = t(key);
      if (attrName === 'textContent' || attrName === 'innerHTML') {
        node[attrName] = value;
      } else {
        node.setAttribute(attrName, value);
      }
    }
  }
  return count;
}

/** Reflect the active locale on `<html lang>`. */
function syncDocumentLanguage(language, documentRef = globalThis.document) {
  if (documentRef?.documentElement) documentRef.documentElement.lang = language;
}

/**
 * Set the active locale, re-running the DOM walk and updating `<html lang>`.
 * Does not persist the choice; the switcher persists before reloading.
 * @param {string} language
 * @param {Document} [documentRef]
 * @returns {Promise<void>}
 */
export async function setLanguage(language, documentRef = globalThis.document) {
  if (!i18next.isInitialized) return;
  const normalized = normalizeLanguage(language);
  await i18next.changeLanguage(normalized);
  syncDocumentLanguage(normalized, documentRef);
  translateDom(documentRef);
}

/** Read the currently active locale (base code). */
export function currentLanguage() {
  return i18next.isInitialized ? normalizeLanguage(i18next.language) : DEFAULT_LANGUAGE;
}

/**
 * Remember an explicit language choice so the next load starts in it. Returns
 * the normalized locale actually stored.
 * @param {string} language
 * @param {Storage} [storage]
 * @returns {string}
 */
export function persistLanguage(language, storage = globalThis.localStorage) {
  const normalized = normalizeLanguage(language);
  try {
    storage?.setItem(I18N_STORAGE_KEY, normalized);
  } catch {
    // Private-mode / blocked storage: fall through to the default on reload.
  }
  return normalized;
}

/**
 * Initialize i18next. Idempotent: repeated calls return the same promise.
 * Vietnamese is used unless an explicit choice was persisted.
 * @param {object} [options]
 * @param {object} [options.resources] Resources to merge in.
 * @param {string} [options.language] Force an initial locale (tests).
 * @returns {Promise<i18next.i18next>}
 */
export function initI18n({ resources, language } = {}) {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const initial = language ? normalizeLanguage(language) : (readStoredLanguage() || DEFAULT_LANGUAGE);
    await i18next.init({
      lng: initial,
      // English is the source of truth; missing keys fall back to it.
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_LANGUAGES,
      resources: resources || I18N_RESOURCES,
      interpolation: { escapeValue: false },
      returnNull: false,
      load: 'languageOnly',
    });
    _initialized = true;
    syncDocumentLanguage(currentLanguage());
    translateDom(globalThis.document);
    return i18next;
  })();
  return _initPromise;
}
