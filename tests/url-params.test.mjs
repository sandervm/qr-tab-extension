import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUrl, buildUrl } from "../src/lib/url-params.js";

const all = (p) => new Set(p.params.map((x) => x.index));
const except = (p, ...drop) => new Set(p.params.map((x) => x.index).filter((i) => !drop.includes(i)));

test("no query string", () => {
  const p = parseUrl("https://example.com/a/b#top");
  assert.equal(p.params.length, 0);
  assert.equal(buildUrl(p, new Set()), "https://example.com/a/b#top");
});

test("all params kept returns the original string byte-for-byte", () => {
  const u = "https://ex.com/s?q=a+b%20c&&x=%E2%9C%93&flag#frag";
  const p = parseUrl(u);
  assert.equal(buildUrl(p, all(p)), u);
});

test("display values are decoded, rebuild keeps raw encoding", () => {
  const p = parseUrl("https://ex.com/?q=a+b%20c&path=%2Fx%2Fy&utm_source=news");
  assert.deepEqual(p.params.map((x) => [x.name, x.value]), [["q", "a b c"], ["path", "/x/y"], ["utm_source", "news"]]);
  assert.equal(buildUrl(p, except(p, 2)), "https://ex.com/?q=a+b%20c&path=%2Fx%2Fy");
});

test("removing all params drops the ? but keeps the hash", () => {
  const p = parseUrl("https://ex.com/page?a=1&b=2#section");
  assert.equal(buildUrl(p, new Set()), "https://ex.com/page#section");
});

test("duplicate keys are separate rows", () => {
  const p = parseUrl("https://ex.com/?tag=a&tag=b&tag=c");
  assert.equal(p.params.length, 3);
  assert.equal(buildUrl(p, except(p, 1)), "https://ex.com/?tag=a&tag=c");
});

test("valueless and empty-valued params", () => {
  const p = parseUrl("https://ex.com/?flag&empty=&k=v");
  assert.deepEqual(p.params.map((x) => [x.name, x.value, x.hasValue]), [["flag", "", false], ["empty", "", true], ["k", "v", true]]);
  assert.equal(buildUrl(p, except(p, 0)), "https://ex.com/?empty=&k=v");
});

test("value containing = and a ? inside the hash", () => {
  const p = parseUrl("https://ex.com/?token=abc==&x=1#/route?not=param");
  assert.equal(p.params.length, 2);
  assert.equal(p.params[0].value, "abc==");
  assert.equal(buildUrl(p, except(p, 1)), "https://ex.com/?token=abc==#/route?not=param");
});

test("malformed percent-encoding falls back to raw text", () => {
  const p = parseUrl("https://ex.com/?bad=%E0%A4%A&ok=1");
  assert.equal(p.params[0].value, "%E0%A4%A");
});

test("non-web schemes are not split into params", () => {
  for (const u of ["about:reader?url=x", "data:text/plain,a?b=c", "chrome://settings/?search=x"]) {
    const p = parseUrl(u);
    assert.equal(p.params.length, 0, u);
    assert.equal(buildUrl(p, new Set()), u);
  }
});

test("empty input", () => {
  const p = parseUrl("");
  assert.equal(buildUrl(p, new Set()), "");
});
