# Tab QR

A Firefox and Chrome extension (Manifest V3) that shows a QR code for the current tab's URL, so you can open the page on your phone, with control over which query parameters go into the code.

- **Size picker**: Small, Medium or Large (192–320 px), remembered between uses
- **Query parameters panel**, collapsed by default: one checkbox per `?key=value`; unchecked params are removed from the QR code
- **Toggle all** checkbox (shows a partial state when only some are selected)
- Copy URL, save as PNG, error-correction level (L/M/Q/H, remembered)
- Handles duplicate keys, valueless params (`?flag`), fragments, Firefox Reader View, and URLs too long for a QR code
- Light and dark theme; the QR itself is always black on white so it scans

## Privacy and permissions

| Permission  | Why |
|-------------|-----|
| `activeTab` | Read the current tab's URL, only after you click the toolbar button |
| `storage`   | Remember the size and error-correction level (`storage.local`, on this device only) |

No network access, no analytics, no third-party code: the QR encoder in `src/lib/qr.js` is self-contained. The Firefox manifest declares that no user data is collected (`data_collection_permissions`).

## Requirements

| Tool | Used for | Version |
|------|----------|---------|
| Python | `build.py` (standard library only) | 3.8+ |
| Node.js | Unit tests; optional `web-ext` tooling via `npx` | 18+ |
| Firefox | Running the extension | 109+ (`strict_min_version`) |
| Chrome, Edge, Brave | Running the extension | 88+ (Manifest V3) |

There is nothing to `npm install`. `package.json` has no dependencies, and the JavaScript in `src/` runs in the browser as written, with no bundler or transpiler.

## Quick start

```sh
npm test            # unit tests
python3 build.py    # builds dist/firefox, dist/chrome and a zip for each
```

Then load the extension in your browser as described under [Install](#install).

## Build

```sh
python3 build.py    # or: npm run build
```

| Output | Contents |
|--------|----------|
| `dist/firefox/` | Copy of `src/`, manifest unchanged |
| `dist/chrome/` | Copy of `src/`, with the Firefox-only `browser_specific_settings` key removed so Chrome doesn't warn about it |
| `dist/tab-qr-firefox-<version>.zip` | Upload for addons.mozilla.org (AMO) |
| `dist/tab-qr-chrome-<version>.zip` | Upload for the Chrome Web Store and Microsoft Edge Add-ons |

`<version>` comes from `src/manifest.json`. Every build deletes and recreates `dist/<target>/`, so don't edit files in `dist/`. Edit `src/` and rebuild.

## Install

### Firefox (development)

**about:debugging** (no tools needed):

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `src/manifest.json` (no build needed) or `dist/firefox/manifest.json`.
3. After you edit a file, click **Reload** on the add-on's card.

Temporary add-ons are removed when Firefox restarts.

**web-ext** (auto-reload):

```sh
npx web-ext run --source-dir src
```

This starts Firefox with a fresh profile and the extension installed, and reloads it every time you save a file in `src/`. `npx` downloads Mozilla's `web-ext` the first time.

### Chrome, Edge, Brave (development)

1. `python3 build.py`
2. Open `chrome://extensions` (`edge://extensions` in Edge, `brave://extensions` in Brave).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick `dist/chrome/`.
5. Pin the button: puzzle-piece menu → pin **Tab QR**.
6. After you edit `src/`, rebuild and click the reload icon ↻ on the extension's card. Chrome runs the copy in `dist/chrome/`, not `src/`.

Loading `src/` directly also works, but Chrome then warns about the unrecognized `browser_specific_settings` key. The warning is harmless.

To launch Chromium or Chrome with the extension from the command line: `npx web-ext run --target chromium --source-dir dist/chrome`.

### Permanent install

- **Firefox** release and beta builds only install signed add-ons. Either publish on AMO (see [Releasing](#releasing)) or let AMO sign it for self-distribution ("On your own"). Either way you get a signed `.xpi` that you install via `about:addons` → ⚙ → **Install Add-on From File…**. Firefox Developer Edition, Nightly and ESR can install the unsigned zip once `xpinstall.signatures.required` is set to `false` in `about:config`.
- **Chrome** can install it from the Chrome Web Store once it's published. Otherwise, keep `dist/chrome/` loaded unpacked. It stays installed across restarts as long as Developer mode is on and the folder isn't moved.

## Test

### Unit tests

```sh
npm test
```

This runs every `tests/*.test.mjs` with Node's built-in test runner (`node:test`). The tests cover query-string parsing and rebuilding in `src/lib/url-params.js`: byte-for-byte preservation, duplicate keys, valueless params, fragments, malformed percent-encoding and non-web schemes. The QR encoder has no unit tests (see [Changing the QR encoder](#changing-the-qr-encoder)).

### Manual checklist

Run this in Firefox and in Chrome before a release, or after changing the popup:

- [ ] A page without a query string shows "No query parameters", and the panel doesn't open.
- [ ] `https://example.com/?a=1&b=two%20words&flag&tag=x&tag=y#frag` lists 5 rows. Unchecking rows updates the URL box and the QR code, `#frag` stays, and **Toggle all** shows a partial state.
- [ ] With every parameter checked, the URL box matches the address bar exactly.
- [ ] Change the size and the error-correction level, close the popup and reopen it: both are remembered.
- [ ] **Copy URL** puts the shown URL on the clipboard.
- [ ] **Save PNG** downloads `qr-<host>.png`, and it scans.
- [ ] The on-screen code scans with a phone camera.
- [ ] A very long URL shows the "too long" message, and **Save PNG** is disabled. On example.com, run `location.search = "?q=" + "a".repeat(2400)` in the page's devtools console, then open the popup. That URL exceeds level M; switching to L makes it fit.
- [ ] Firefox Reader View encodes the article's real URL, not `about:reader?…`.
- [ ] A browser-internal page (`about:addons`, `chrome://settings`) gives a QR code or a clear message, never a blank or broken popup.
- [ ] With the OS in dark mode the popup turns dark, and the QR code stays black on white.

### Debugging the popup

- **Firefox:** on `about:debugging`, click **Inspect** on the add-on. In the toolbox's ⋯ menu, turn on **Disable Popup Auto-Hide** so the popup stays open while you inspect it.
- **Chrome:** right-click the toolbar button → **Inspect popup**.

## How it works

```
src/
  manifest.json         MV3 manifest, Firefox form (build.py derives the Chrome one)
  popup/popup.html      the popup: the extension's only UI
  popup/popup.css       light/dark colour tokens and layout
  popup/popup.js        state, rendering, events, settings
  lib/qr.js             QR encoder (byte mode, UTF-8, versions 1–40, L/M/Q/H)
  lib/url-params.js     query-string parse/rebuild without re-encoding
  icons/                16, 32, 48, 96 and 128 px PNGs
tests/                  node:test unit tests for src/lib
build.py                builds dist/firefox, dist/chrome and their zips
```

There is no background script. Everything runs in the popup, which the browser creates when you click the button and destroys when it closes:

1. `init()` loads settings from `storage.local` and reads the active tab's URL with `tabs.query`, unwrapping Firefox's `about:reader?url=…`.
2. `parseUrl()` splits the URL into `base`, `params` and `hash`. Each param keeps its exact `raw` text, plus a decoded `name` and `value` for display.
3. All params start out included. Every change (checkbox, size, error-correction level) updates the `state` object and re-renders.
4. `renderQr()` runs `buildUrl()` → `encodeText()` → `toSvgPath()` and draws an SVG. **Save PNG** draws the same modules on a canvas at a whole number of pixels per module, with the full 4-module border.

Browser APIs are called through `const api = globalThis.browser ?? globalThis.chrome`. In Manifest V3 both browsers return promises, so the same code runs in both.

Notes:

- Query params are rebuilt from the raw text, so `%20`, `+` and other encodings stay exactly as they were. With every param checked, the QR encodes the original URL byte-for-byte.
- Only `http(s)`, `ftp` and `file` URLs are split into params; other schemes are encoded as-is.
- Max URL length: 2953 bytes at level L, 2331 at M, 1663 at Q, 1273 at H.

## Extending

### Ground rules

- **No third-party code and no network requests.** That's the privacy promise above, and it keeps store review simple. If you need a library, write the small part you need in `src/lib/`, the way `qr.js` was.
- **No JavaScript build step.** Files load as native ES modules, so imports must be relative and end in `.js` (`"../lib/qr.js"`); bare names like `"lodash"` don't resolve. Manifest V3 also blocks inline `<script>` blocks, `onclick="…"` attributes, `eval` and remotely hosted code.
- **Keep `src/` loadable in Firefox as it is.** That's the fastest development loop. Put browser differences in `build.py`.
- **Never re-encode URLs.** `URL` and `URLSearchParams` normalize encoding (`%20` becomes `+`, characters get re-escaped), so the link in the QR code would differ from the one in the address bar. Work with each param's `raw` text.
- **Keep the QR code dark on light, with a white border (quiet zone).** In the popup the border is 2 modules (`SCREEN_QUIET_ZONE`), which keeps the box compact and still scans, also in dark mode. The saved PNG uses the spec's full 4 modules (`PNG_QUIET_ZONE`) because it can end up on any background. Many phone scanners fail on inverted, low-contrast or borderless codes.
- **Keep `src/lib/` free of DOM and browser APIs**, so Node can unit-test it.
- **Keep permissions minimal.** Each new permission shows a warning at install. In Chrome, an update that adds a warning disables the extension until the user approves it.

### Add a remembered setting

Use `size` or `ecl` (both `<select>` dropdowns) as the template.

1. **`popup.html`:** add the control inside `<main>` as a `<div class="control">` row (a label and the control) with a unique `id` and a `<label for>`.
2. **`popup.js`:**
   - Add the default to `DEFAULTS`. It doubles as the defaults object for `storage.local.get`.
   - Add the element to `el` and the value to `state`.
   - In `loadSettings()`, check the stored value's type and range before using it, because it may come from an older version.
   - Add the key to `saveSettings()`. That function writes an explicit object, so a key you forget there is silently never saved.
   - In `init()`, show the loaded value in the control, the way `el.ecl.value = state.ecl` does.
   - Add a listener that updates `state`, calls `saveSettings()` and re-renders: `renderQr()` if the encoded URL or the code changes, or a CSS custom property for layout-only changes (see `applySize()`).
3. **`popup.css`:** reuse the tokens (`--surface`, `--border`, `--muted`, `--accent`, `--radius`) so the control works in light and dark mode.

### Add URL logic

For example, unchecking `utm_*` parameters automatically, or dropping the `#fragment`:

1. Write a pure function in `src/lib/url-params.js` (or a new file in `src/lib/`) that works on the `parseUrl()` result. Match on the decoded `name`, and keep output built from `raw`.
2. Add tests to `tests/url-params.test.mjs`, or a new `tests/<name>.test.mjs`; `npm test` picks up every `*.test.mjs` file.
3. Wire it into the popup through `state` and `renderQr()`. For things like "uncheck tracking params", adjust `state.included` in `init()` after parsing, so the user can still re-check them.

### Change how the QR code looks or is exported

The code is drawn in two places: as an SVG in `renderQr()` (on screen) and on a canvas in the **Save PNG** click handler. Change both, or the saved image won't match what's on screen. A new export format only needs `state.qr.size`, `state.qr.get(x, y)` and `PNG_QUIET_ZONE`. Exported files keep the full 4-module border; `SCREEN_QUIET_ZONE` is only for the popup. For example, an SVG download can serialize `#qr` with `XMLSerializer` and reuse the PNG handler's download pattern.

### Add a keyboard shortcut

This only needs a manifest change:

```json
"commands": {
  "_execute_action": {
    "suggested_key": { "default": "Alt+Shift+Q" }
  }
}
```

The shortcut opens the popup and counts as a user action, so `activeTab` still grants the URL. Users can change it at `about:addons` → ⚙ → **Manage Extension Shortcuts** (Firefox) or at `chrome://extensions/shortcuts`.

### Add a manifest key only one browser understands

- Firefox-only settings go under `browser_specific_settings`, which `build.py` already removes for Chrome.
- For anything else, keep the Firefox form in `src/manifest.json` and change the `chrome` dict in `build.py`'s `main()`. For example, a background script is declared as `"background": {"scripts": [...]}` for Firefox, while Chrome requires `"background": {"service_worker": "..."}`.
- To add another target, add a `(target, manifest)` pair to the loop in `main()`. Edge, Brave and Opera use the Chrome build as-is.

### Add a permission

1. Add it to `permissions` in `src/manifest.json`. Better still, put it in `optional_permissions` and call `api.permissions.request()` from a click, so the user is asked only when they need the feature.
2. Update the [Privacy and permissions](#privacy-and-permissions) table.
3. When you publish, give the store a justification for the new permission (the Chrome Web Store asks for one per permission).

### Changing the QR encoder

`src/lib/qr.js` follows ISO/IEC 18004 and has no unit tests. Before you change it, save the `toSvgPath(encodeText(url, level))` output for a handful of URLs at every level. Afterwards, check that the output is identical. If you meant to change the output, check that the new codes scan, either with a phone or with a decoder such as `zbarimg` on saved PNGs. If capacity changes, update the max-length numbers in [How it works](#how-it-works).

## Releasing

1. **One time:** change `browser_specific_settings.gecko.id` in `src/manifest.json` from `tab-qr@example.com` to an ID you own, such as `tab-qr@yourdomain.com`. AMO identifies the add-on by this ID, so never change it after the first upload.
2. Bump `version` in **both** `src/manifest.json` and `package.json`. Both stores reject a version number they have already received.
3. `npm test`
4. `python3 build.py`
5. `npx web-ext lint --source-dir dist/firefox`, which must report 0 errors. web-ext 10 currently reports 2 warnings; see [Known issues](#known-issues).
6. Go through the [manual checklist](#manual-checklist) in Firefox and Chrome, using the builds in `dist/`.
7. Upload:
   - **Firefox:** upload `dist/tab-qr-firefox-<version>.zip` at <https://addons.mozilla.org/developers/>. When AMO asks for source code, answer that none is needed: nothing is minified, bundled or transpiled.
   - **Chrome:** upload `dist/tab-qr-chrome-<version>.zip` in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole). The store asks for a reason for each permission (see the table above) and how user data is handled (none is collected).
   - **Edge:** the same Chrome zip works in [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Chrome warns about an unrecognized `browser_specific_settings` key | You loaded `src/`. The warning is harmless; load `dist/chrome/` instead to get rid of it. |
| Your change doesn't show up | Firefox: click **Reload** on `about:debugging`. Chrome: run `python3 build.py`, then click ↻ (Chrome runs `dist/chrome/`). |
| The add-on is gone after restarting Firefox | Temporary add-ons don't survive a restart. Load it again, or use `npx web-ext run`. |
| Firefox refuses to install the zip | Release Firefox requires a signed add-on. See [Permanent install](#permanent-install). |
| "This tab's address isn't available to extensions." | The browser didn't give the extension the URL, which happens on some browser-internal pages. This is expected. |
| "This URL is too long for a QR code" | The URL is over capacity for the chosen level. Uncheck some parameters or choose a lower error-correction level. |
| An error in the popup console about Content Security Policy | Inline scripts, `on…=` attributes, `eval` and remote scripts are blocked in Manifest V3. Move the code into a `.js` file under `src/`. |

## Known issues

- **`strict_min_version` is lower than `data_collection_permissions` supports.** The manifest allows Firefox 109+, but the `data_collection_permissions` key exists only from Firefox 140 (desktop) and 142 (Android). web-ext 10 reports this as two warnings, `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION` and `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`, while web-ext 8 doesn't. Lint errors would block an upload; these warnings don't. To clear them, raise `strict_min_version` to `"140.0"` and add `"gecko_android": { "strict_min_version": "142.0" }` under `browser_specific_settings`. That drops support for older Firefox versions. Keep the `data_collection_permissions` key either way: since November 2025, AMO won't sign a new add-on that doesn't declare it.

## Working on it with Claude Code

`.claude/skills/tab-qr-extension/` is a Claude Code skill with this project's build, install, test and extension workflow. Claude Code loads it automatically when you ask it to work on the extension, for example "add a Save SVG button" or "prepare 1.1.0 for AMO". It includes a check script that runs the static Manifest V3 checks, the version-sync check, the tests and the build in one go:

```sh
python3 .claude/skills/tab-qr-extension/scripts/check.py            # before calling a change done
python3 .claude/skills/tab-qr-extension/scripts/check.py --lint --release   # before a store upload
```

## License

MIT, as declared in `package.json`. Add a `LICENSE` file before publishing.
