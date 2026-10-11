---
name: tab-qr-extension
description: Build, load, debug, test, release and extend the Tab QR browser extension in this repo (Manifest V3, Firefox + Chrome/Edge/Brave, plain ES modules, no dependencies, build.py packaging). Use this skill whenever the user wants to build or package the extension, install or load it in a browser, debug the popup, run or add tests, bump the version or publish to AMO / Chrome Web Store / Edge Add-ons, or add or change anything about it — a new popup control or remembered setting, QR rendering or export formats (PNG/SVG), query-parameter or URL handling, permissions, keyboard shortcuts, background scripts or manifest keys — even if they just say "the popup", "the add-on" or "the QR thing" and never mention this skill.
---

# Tab QR extension

Tab QR is a Manifest V3 extension for Firefox and Chromium browsers. Its toolbar button opens a popup with a QR code for the current tab's URL, a size picker (Small/Medium/Large), an error-correction picker, and a checkbox per query parameter to include or drop it. It is plain HTML/CSS/ES modules with zero dependencies and no bundler; `build.py` only copies `src/` and adjusts the manifest per browser.

`README.md` is the human manual: install steps, the manual test checklist, the release checklist, troubleshooting. This skill is what you need to change the code without breaking the promises the README makes. Point the user at README sections instead of re-typing them, and keep the README true when you change behaviour.

## Project map

| Path | What's there |
|------|--------------|
| `src/manifest.json` | The only manifest, in Firefox form. `version` is duplicated in `package.json`. |
| `src/popup/popup.html` | The only UI; loads `popup.js` as a module. |
| `src/popup/popup.js` | `DEFAULTS`, `el` (element map), `state`, `loadSettings`/`saveSettings`, `getActiveTabUrl`, `renderQr`, `renderParamList`, `updateParamSummary`, `applySize`, event listeners, `init()`. |
| `src/popup/popup.css` | Colour tokens on `:root`, dark overrides under `prefers-color-scheme`; `--qr-size` drives the layout. |
| `src/lib/url-params.js` | `parseUrl(url)` → `{original, base, hash, params: [{index, raw, name, value, hasValue}]}`; `buildUrl(parsed, includedIndexSet)`. |
| `src/lib/qr.js` | `encodeText(text, ecl)` → `{version, size, get(x, y)}`; throws `RangeError` with `code: "DATA_TOO_LONG"`, `bytes`, `max`. `toSvgPath(qr, border)`, `maxBytes(ecl)`. |
| `tests/*.test.mjs` | `node:test` unit tests for `src/lib` (url-params only; qr.js is untested). |
| `build.py` | `src/` → `dist/firefox/`, `dist/chrome/` (minus `browser_specific_settings`), and `dist/tab-qr-<target>-<version>.zip`. |

Flow: the popup opens → `init()` loads settings and the tab URL in parallel → `parseUrl` → every param included → `renderParamList()` + `renderQr()`. Each handler mutates `state` and re-renders. The popup is destroyed when it closes, so nothing survives except what is in `storage.local`. There is no background script.

Popup height budget: Chrome and Firefox cap popups at 600 px tall. Everything except the QR box (padding, gaps, Size row, URL box, collapsed params panel, EC row) measures about 267 px, so a QR box over about 333 px makes the popup scroll. Keep that in mind when adding rows or sizes.

## Commands

| Task | Command |
|------|---------|
| Everything below in one go (static MV3 checks, version sync, tests, build) | `python3 .claude/skills/tab-qr-extension/scripts/check.py` |
| … plus `web-ext lint`, and fail on the placeholder gecko id | `… check.py --lint --release` |
| Unit tests | `npm test` (Node 18+, nothing to install) |
| Build | `python3 build.py` (wipes and rewrites `dist/`; never edit there) |
| Lint the Firefox build | `npx --yes web-ext lint --source-dir dist/firefox` |
| Firefox with live reload | `npx web-ext run --source-dir src` |
| Chromium with the extension | `npx web-ext run --target chromium --source-dir dist/chrome` |

`web-ext run` opens a browser window on the user's desktop, so offer it rather than launching it unannounced. `npx` needs network on first use.

Known lint state: web-ext 10 reports two warnings (`KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION`, `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`) because `strict_min_version` is 109 while `data_collection_permissions` needs Firefox 140 / Android 142. That is a support-range decision documented in README → Known issues; don't "fix" it silently. Any *new* warning or any error is yours to explain or fix.

## Loading it in a browser is the user's job

Neither you nor browser-automation tools can operate `about:debugging` or `chrome://extensions`, so give the user exact steps with absolute paths and tell them what to reload:

- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on… → `<abs>/src/manifest.json`. After changes: **Reload** on the card. Temporary add-ons vanish on restart.
- **Chrome / Edge / Brave:** `python3 build.py` → `chrome://extensions` → Developer mode → Load unpacked → `<abs>/dist/chrome`. After changes: **rebuild, then ↻**. Chrome runs the copy in `dist/`, so a forgotten rebuild is the usual cause of "my change doesn't show up".
- **Popup devtools:** Firefox: Inspect on `about:debugging`, then ⋯ → Disable Popup Auto-Hide. Chrome: right-click the toolbar button → Inspect popup.

## Invariants (and why)

1. **No third-party code, no network.** The README promises it, the permissions are only `activeTab` + `storage`, and it keeps store review trivial (AMO needs no source upload because nothing is bundled or minified). If a feature seems to need a library, write the small part you need in `src/lib/`; `qr.js` is the precedent. No `fetch` to the outside, analytics, remote fonts or CDN scripts.
2. **No JS build step.** The browser loads `src/` directly as ES modules. Imports must be relative with an explicit `.js` (`"../lib/qr.js"`); bare specifiers don't resolve. TypeScript, JSX or npm runtime deps would need a bundler and, with it, AMO source submissions.
3. **MV3 content security policy.** No inline `<script>` blocks, no `on…="…"` attributes, no `eval`/`new Function`, no remotely hosted code. Violations only show up as a CSP error in the popup console at runtime; `check.py` catches them statically.
4. **One Firefox-shaped manifest.** `src/` must stay loadable as a Firefox temporary add-on, because that is the fastest dev loop. Firefox-only keys go under `browser_specific_settings` (already stripped for Chrome). Other per-browser differences get produced in `build.py`'s `main()` by editing the `chrome` dict.
5. **Browser APIs through `api`.** `const api = globalThis.browser ?? globalThis.chrome;` and promise style (`await api.storage.local.get(...)`). No callbacks, no direct `chrome.*`.
6. **Never re-encode URLs.** `buildUrl` joins each param's `raw` text, and with every param included it returns `original` unchanged. `new URL()` / `URLSearchParams` rewrite `%20`→`+` and re-escape characters, so the phone would open a different link than the address bar shows. `name`/`value` are decoded copies for display and matching only. The tests pin this; keep them green.
7. **The QR code stays scannable.** Black on white, PNG at whole pixels per module. `.qr-frame` deliberately ignores the dark theme. The white border is `SCREEN_QUIET_ZONE = 2` modules in the popup (the user wanted a slimmer border; verified to decode in light and dark mode) and `PNG_QUIET_ZONE = 4` in exported files, which can land on any background. Don't shrink the export border, and don't go below 2 on screen: inverted, low-contrast or borderless codes fail on many phone scanners.
8. **Stored settings are untrusted.** `loadSettings` checks the type and range of each value because storage can hold values from older versions. Do the same for every new key.
9. **Minimal permissions.** `activeTab` is what makes `tab.url` readable, and it is granted by the toolbar click (or a `commands` shortcut). Adding `tabs` or host permissions changes the install warning, and Chrome disables the extension on update until the user accepts new warnings. Prefer `optional_permissions` + `api.permissions.request()` from a click. Any permission change also updates the README's Privacy and permissions table.

## Recipes

### A new remembered setting
Model it on `ecl` or `size` (both `<select>`s):
1. `popup.html`: add a `.control` row (label + control) inside `<main>`, with a unique `id` and `<label for>`.
2. `popup.js`:
   - add the default to `DEFAULTS` (it is also the defaults object passed to `storage.local.get`);
   - add the element to `el` and the field to `state`;
   - validate and assign it in `loadSettings()`;
   - add the key to `saveSettings()`, which writes an explicit object, so a key you forget there silently never persists;
   - reflect the loaded value into the control in `init()` (like `el.ecl.value = state.ecl`);
   - add a listener: update `state` → `saveSettings()` → re-render. Use `renderQr()` if the encoded URL or the code changes; for layout-only changes, use a CSS custom property as `applySize()` does.
3. `popup.css`: reuse `--surface`, `--border`, `--muted`, `--accent`, `--radius` so dark mode just works.

### URL logic (strip tracking params, drop the fragment, …)
Write pure functions in `src/lib/` that operate on the `parseUrl` result: match on the decoded `name`, emit from `raw`. Add tests in `tests/` (any `*.test.mjs` is picked up). Then wire it through `state` + `renderQr()`. Keep `src/lib` free of `document`, `window` and `api` so Node can import it. For "auto-uncheck" behaviour, adjust `state.included` in `init()` after parsing, which leaves the user free to re-check a row.

### QR appearance or a new export format
There are two render paths that must stay in sync: the SVG in `renderQr()` and the canvas loop in the `el.download` click handler. A new export reuses `state.qr` (`size`, `get(x, y)`) and `PNG_QUIET_ZONE`. For an SVG download: `new XMLSerializer().serializeToString(el.svg)` → `Blob` of type `image/svg+xml` → the same anchor-click, `fileStem()` and `flash()` pattern as the PNG. A new button belongs in `.actions` next to the others, and must be disabled whenever `state.qr` is null (copy how `el.download.disabled` is handled in `renderQr()` and `init()`).

### Manifest-level features
- **Keyboard shortcut:** `"commands": {"_execute_action": {"suggested_key": {"default": "Alt+Shift+Q"}}}`. This opens the popup with no JS and still grants `activeTab`.
- **Background script** (context menus and the like): Firefox MV3 takes `"background": {"scripts": ["background.js"]}`, while Chrome requires `"background": {"service_worker": "background.js"}`. Keep the Firefox form in `src/manifest.json` and rewrite it for the `chrome` dict in `build.py`. MV3 background contexts are torn down when idle, so durable state goes in `storage`, not globals. Popup-only features don't need one.
- **Another browser target:** add a `(target, manifest)` pair to the loop in `build.py`'s `main()`. Edge, Brave and Opera use the Chrome build unchanged.

### Changing `qr.js`
It implements ISO/IEC 18004 (byte mode, versions 1–40, L/M/Q/H) and has no tests, so protect yourself first: snapshot `toSvgPath(encodeText(u, ecl))` for a dozen URLs × four levels with a quick `node -e` script, then diff after editing. A good permanent fix is to turn that snapshot into `tests/qr.test.mjs`. If the output changes on purpose, ask the user to scan a few codes with a phone. The README quotes `maxBytes()` (2953/2331/1663/1273 for L/M/Q/H); update it if capacity logic changes.

## Before you say it's done

1. Run `python3 .claude/skills/tab-qr-extension/scripts/check.py` (add `--lint` when the network is available). It must end in "All checks passed."
2. Logic changes in `src/lib` ship with tests in the same change.
3. For anything visible in the popup, tell the user what to reload (see above) and which items from README → Test → Manual checklist to try. Pick the relevant ones; don't paste the whole list.
4. Update `README.md` when features, permissions, requirements, commands or limits change.

## Releases

The steps are in README → Releasing. Your part is to bump `version` in **both** `src/manifest.json` and `package.json` (check.py fails on a mismatch), run `check.py --lint --release`, and report what is left for the user.

Ask before setting the gecko id. It is the add-on's permanent identity on AMO and can't change after the first upload; suggest `tab-qr@<their-domain>`. Never sign or upload on your own (`web-ext sign`, store dashboards): publishing is outward-facing, and a version number can't be reused once a store has seen it.
