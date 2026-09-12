# Vietnamese i18n with Vietnamese default

## Summary

Add an `i18next`-based localization layer to the God's Eye View app so all user-facing labels are translatable, with Vietnamese (`vi`) as the default language for every user regardless of browser language.

## Scope

- All user-facing labels across:
  - `index.html` (static text, `title`, `aria-label`, `placeholder`, `alt`)
  - `src/ui.js` (textContent / innerHTML assignments)
  - `src/main.js` (loader status lines)
  - `src/keySetup.js`, `src/firstRunExperience.js`, `src/overlays/worldOverlay.js`, `src/mapStackChips.js`, `src/celestialRing.js`
- Out of scope: dynamic data values (coordinates, timestamps, counts, unit strings), Cesium attribution strings, and the brand title "GOD'S EYE VIEW".

## Approach

1. Add `i18next` + `i18next-browser-linguagedetector` to `package.json` dependencies.
2. Create `src/i18n.js` — initializes i18next with the browser detector, sets `fallbackLng: 'vi'`, `supportedLng: ['vi', 'en']`, `interpolation: { escapeValue: false }`, and persistence via `localStorage` (`i18nextLng`).
3. Create `src/locales/en/translation.json` (source of truth, English strings) and `src/locales/vi/translation.json` (Vietnamese). Keys are dot-namespaced; missing keys fall back to the English value at runtime via `returnNull`/fallback.
4. Add a small language switcher chip to `index.html` (top-center nav) so users can toggle `vi`/`en`.
5. Tag HTML strings with `data-i18n="key"`; on init, walk the DOM and replace text via `t(key)`. For `aria-label`/`title`/`alt`, use `data-i18n-attr="key"`.
6. Replace hardcoded `textContent`/`innerHTML` assignments in JS with `t(key)` calls (or `t(key, { count })` where pluralized). Wrap the `StyleManager` in `src/ui.js` so text updates re-run through `t()`.
7. Set `<html lang="vi">` at init and update `lang` on locale change.
8. Update `vite.config.js` if needed (no change expected; locale JSON is under `src/`).

## Files to modify

- `package.json` — add i18next deps.
- `src/i18n.js` — new.
- `src/locales/en/translation.json` — new.
- `src/locales/vi/translation.json` — new.
- `index.html` — add `data-i18n` tags + language switcher chip.
- `src/main.js` — init i18n before other modules.
- `src/ui.js` — replace hardcoded strings with `t()`.
- `src/keySetup.js`, `src/firstRunExperience.js`, `src/overlays/worldOverlay.js`, `src/mapStackChips.js`, `src/celestialRing.js` — replace hardcoded strings.

## Validation

- `npm test` (unit tests) must pass; add a `src/i18n.test.mjs` covering key coverage (every `data-i18n` key exists in `vi` and `en`) and default-locale behavior.
- `npm run build` must succeed.
- Manual: load app, verify all labels render in Vietnamese by default; toggle switcher to English and verify switch; reload and verify Vietnamese persists.