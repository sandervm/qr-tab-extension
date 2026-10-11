import { encodeText, toSvgPath } from "../lib/qr.js";
import { parseUrl, buildUrl } from "../lib/url-params.js";

// Works in Firefox (`browser`) and Chrome (`chrome`); both return promises in MV3.
const api = globalThis.browser ?? globalThis.chrome;

// White border around the code, in modules. The spec asks for 4; on screen the white frame
// is all a scanner sees around the code and 2 scans fine, so less space is wasted. The saved
// PNG keeps the full 4 because it may end up on any background.
const SCREEN_QUIET_ZONE = 2;
const PNG_QUIET_ZONE = 4;
const SIZES = [192, 256, 320]; // px, matches the #size options
const DEFAULTS = { size: 256, ecl: "M" };

const $ = (id) => document.getElementById(id);
const el = {
  frame: $("qr-frame"),
  svg: $("qr"),
  message: $("qr-message"),
  size: $("size"),
  urlOut: $("url-out"),
  meta: $("meta"),
  copy: $("copy"),
  download: $("download"),
  params: $("params"),
  paramsSummary: $("params-summary"),
  toggleAll: $("toggle-all"),
  list: $("param-list"),
  ecl: $("ecl"),
};

const state = {
  parsed: null,          // result of parseUrl()
  included: new Set(),   // indexes of params that go into the QR code
  size: DEFAULTS.size,
  ecl: DEFAULTS.ecl,
  qr: null,              // last successful encode
  finalUrl: "",
};

// ---------- settings ----------
async function loadSettings() {
  try {
    const s = await api.storage.local.get(DEFAULTS);
    // Older versions stored any slider value from 128 to 400: snap it to the nearest preset.
    const size = Number(s.size);
    if (Number.isFinite(size)) {
      state.size = SIZES.reduce((best, p) => (Math.abs(p - size) < Math.abs(best - size) ? p : best));
    }
    if (["L", "M", "Q", "H"].includes(s.ecl)) state.ecl = s.ecl;
  } catch { /* storage unavailable: keep defaults */ }
}

function saveSettings() {
  try { api.storage.local.set({ size: state.size, ecl: state.ecl }); } catch { /* ignore */ }
}

// ---------- tab ----------
async function getActiveTabUrl() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  let url = tab?.url ?? "";
  // Firefox Reader View wraps the real page: about:reader?url=<encoded>
  const reader = /^about:reader\?url=(.+)$/.exec(url);
  if (reader) {
    try { url = decodeURIComponent(reader[1]); } catch { /* keep wrapper */ }
  }
  return url;
}

// ---------- rendering ----------
function showMessage(text, isError = false) {
  el.svg.hidden = true;
  el.message.hidden = false;
  el.message.textContent = text;
  el.message.classList.toggle("error", isError);
}

function renderQr() {
  state.finalUrl = buildUrl(state.parsed, state.included);
  el.urlOut.textContent = state.finalUrl;

  try {
    state.qr = encodeText(state.finalUrl, state.ecl);
  } catch (err) {
    state.qr = null;
    if (err.code === "DATA_TOO_LONG") {
      const hint = state.ecl === "L" ? "Remove some parameters." : "Try a lower error-correction level or remove some parameters.";
      showMessage(`This URL is too long for a QR code (${err.bytes} bytes; level ${state.ecl} holds ${err.max}). ${hint}`, true);
    } else {
      showMessage(`Couldn't create a QR code: ${err.message}`, true);
    }
    el.meta.textContent = "";
    el.download.disabled = true;
    return;
  }

  const n = state.qr.size + SCREEN_QUIET_ZONE * 2;
  el.svg.setAttribute("viewBox", `0 0 ${n} ${n}`);
  el.svg.setAttribute("aria-label", `QR code for ${state.finalUrl}`);
  el.svg.replaceChildren();
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", n);
  bg.setAttribute("height", n);
  bg.setAttribute("fill", "#ffffff");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", toSvgPath(state.qr, SCREEN_QUIET_ZONE));
  path.setAttribute("fill", "#000000");
  el.svg.append(bg, path);

  el.svg.hidden = false;
  el.message.hidden = true;
  el.download.disabled = false;
  const bytes = new TextEncoder().encode(state.finalUrl).length;
  el.meta.textContent = `${bytes} B · v${state.qr.version} · ${state.qr.size}×${state.qr.size}`;
}

function applySize() {
  el.size.value = state.size;
  document.documentElement.style.setProperty("--qr-size", `${state.size}px`);
}

function updateParamSummary() {
  const total = state.parsed.params.length;
  const on = state.included.size;
  if (total === 0) {
    el.paramsSummary.textContent = "No query parameters";
    return;
  }
  el.paramsSummary.textContent = on === total
    ? `Query parameters (${total})`
    : `Query parameters (${on} of ${total} included)`;
  el.toggleAll.checked = on === total;
  el.toggleAll.indeterminate = on > 0 && on < total;
}

function renderParamList() {
  const { params } = state.parsed;
  el.params.classList.toggle("empty", params.length === 0);
  el.list.replaceChildren(
    ...params.map((p) => {
      const li = document.createElement("li");
      li.dataset.index = p.index;
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = state.included.has(p.index);
      box.dataset.index = p.index;
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.name || "(empty name)";
      name.title = p.name;
      const value = document.createElement("span");
      value.className = "value";
      value.textContent = p.hasValue ? (p.value === "" ? '""' : p.value) : "(no value)";
      value.title = p.value;
      label.append(box, name, value);
      li.append(label);
      li.classList.toggle("off", !box.checked);
      return li;
    }),
  );
  updateParamSummary();
}

// ---------- events ----------
el.size.addEventListener("change", () => {
  state.size = Number(el.size.value);
  applySize();
  saveSettings();
});

el.ecl.addEventListener("change", () => {
  state.ecl = el.ecl.value;
  saveSettings();
  renderQr();
});

el.list.addEventListener("change", (e) => {
  const box = e.target;
  if (!(box instanceof HTMLInputElement) || box.type !== "checkbox") return;
  const index = Number(box.dataset.index);
  if (box.checked) state.included.add(index);
  else state.included.delete(index);
  box.closest("li").classList.toggle("off", !box.checked);
  updateParamSummary();
  renderQr();
});

el.toggleAll.addEventListener("change", () => {
  // From the indeterminate state a click checks the box, so "toggle all" includes everything.
  const on = el.toggleAll.checked;
  state.included = new Set(on ? state.parsed.params.map((p) => p.index) : []);
  renderParamList();
  renderQr();
});

// A <details> can't be disabled, so stop it opening when there is nothing inside.
el.params.querySelector("summary").addEventListener("click", (e) => {
  if (state.parsed?.params.length === 0) e.preventDefault();
});

el.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.finalUrl);
    flash(el.copy, "Copied");
  } catch {
    // Fallback: select the text so the user can press Ctrl/Cmd+C.
    const range = document.createRange();
    range.selectNodeContents(el.urlOut);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    flash(el.copy, "Press Ctrl+C");
  }
});

el.download.addEventListener("click", () => {
  if (!state.qr) return;
  const n = state.qr.size + PNG_QUIET_ZONE * 2;
  const scale = Math.max(1, Math.round(state.size / n)); // whole pixels per module keeps edges sharp
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < state.qr.size; y++) {
    for (let x = 0; x < state.qr.size; x++) {
      if (state.qr.get(x, y)) ctx.fillRect((x + PNG_QUIET_ZONE) * scale, (y + PNG_QUIET_ZONE) * scale, scale, scale);
    }
  }
  canvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qr-${fileStem(state.finalUrl)}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    flash(el.download, "Saved");
  }, "image/png");
});

function flash(button, text) {
  const original = button.dataset.label ?? button.textContent;
  button.dataset.label = original;
  button.textContent = text;
  clearTimeout(button._t);
  button._t = setTimeout(() => { button.textContent = original; }, 1200);
}

function fileStem(url) {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_") || "page";
  } catch {
    return "page";
  }
}

// ---------- start ----------
async function init() {
  const [, url] = await Promise.all([loadSettings(), getActiveTabUrl().catch(() => "")]);
  applySize();
  el.ecl.value = state.ecl;

  if (!url) {
    state.parsed = parseUrl("");
    renderParamList();
    el.copy.disabled = el.download.disabled = true;
    el.urlOut.textContent = "—";
    showMessage("This tab's address isn't available to extensions.");
    return;
  }

  state.parsed = parseUrl(url);
  state.included = new Set(state.parsed.params.map((p) => p.index));
  renderParamList();
  renderQr();
}

init();
