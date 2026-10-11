/*
 * Query-string handling that never re-encodes the URL.
 *
 * URLSearchParams normalises encoding (%20 -> +, re-escapes characters), which would
 * silently change URLs you want to keep. Instead we split the raw query on "&",
 * keep each raw segment for rebuilding, and decode a copy only for display.
 */

const PARAM_SCHEMES = /^(https?|ftp|file):/i;

function safeDecode(s) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/**
 * @returns {{ original: string, base: string, hash: string,
 *             params: { index: number, raw: string, name: string, value: string, hasValue: boolean }[] }}
 */
export function parseUrl(url) {
  const original = String(url ?? "");
  const hashAt = original.indexOf("#");
  const hash = hashAt >= 0 ? original.slice(hashAt) : "";
  const beforeHash = hashAt >= 0 ? original.slice(0, hashAt) : original;

  const qAt = beforeHash.indexOf("?");
  if (qAt < 0 || !PARAM_SCHEMES.test(original)) {
    return { original, base: beforeHash, hash, params: [] };
  }

  const base = beforeHash.slice(0, qAt);
  const params = beforeHash
    .slice(qAt + 1)
    .split("&")
    .filter((seg) => seg.length > 0)
    .map((raw, index) => {
      const eq = raw.indexOf("=");
      const hasValue = eq >= 0;
      return {
        index,
        raw,
        name: safeDecode(hasValue ? raw.slice(0, eq) : raw),
        value: hasValue ? safeDecode(raw.slice(eq + 1)) : "",
        hasValue,
      };
    });

  return { original, base, hash, params };
}

/**
 * Rebuild the URL keeping only the params whose index is in `included`.
 * When every param is kept, the original string is returned byte-for-byte.
 */
export function buildUrl(parsed, included) {
  const { original, base, hash, params } = parsed;
  if (params.length === 0 || params.every((p) => included.has(p.index))) return original;
  const kept = params.filter((p) => included.has(p.index)).map((p) => p.raw);
  return base + (kept.length ? "?" + kept.join("&") : "") + hash;
}
