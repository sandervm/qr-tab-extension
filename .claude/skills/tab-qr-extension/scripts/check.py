#!/usr/bin/env python3
"""Pre-flight checks for the Tab QR extension.

Static checks on src/ (MV3 content security policy, no-network rule, relative .js imports,
files the manifest points at), version sync between src/manifest.json and package.json,
then the unit tests and the build. Exit code 1 if anything fails.

    python3 .claude/skills/tab-qr-extension/scripts/check.py [--lint] [--release]

--lint     also run `npx web-ext lint` on dist/firefox (downloads web-ext on first use);
           lint errors fail the check, lint warnings are only printed
--release  treat the placeholder gecko id (…@example.com) as an error instead of a warning
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

problems: list[str] = []
warnings: list[str] = []


def find_root() -> Path:
    candidates = [Path.cwd(), *Path.cwd().parents]
    try:
        candidates.append(Path(__file__).resolve().parents[4])  # <root>/.claude/skills/<name>/scripts/
    except IndexError:
        pass
    for d in candidates:
        if (d / "build.py").is_file() and (d / "src" / "manifest.json").is_file():
            return d
    sys.exit("check.py: can't find the project root (a folder with build.py and src/manifest.json)")


def check_manifest(root: Path, release: bool) -> dict:
    src = root / "src"
    manifest = json.loads((src / "manifest.json").read_text())
    pkg = json.loads((root / "package.json").read_text())

    if manifest.get("version") != pkg.get("version"):
        problems.append(f"version mismatch: src/manifest.json {manifest.get('version')!r} vs package.json {pkg.get('version')!r}")

    refs = []
    action = manifest.get("action", {})
    refs.append(action.get("default_popup"))
    icon = action.get("default_icon")
    refs += list(icon.values()) if isinstance(icon, dict) else [icon]
    refs += list(manifest.get("icons", {}).values())
    bg = manifest.get("background", {})
    refs += bg.get("scripts", []) + [bg.get("service_worker"), bg.get("page")]
    refs.append(manifest.get("options_ui", {}).get("page"))
    for cs in manifest.get("content_scripts", []):
        refs += cs.get("js", []) + cs.get("css", [])
    for ref in filter(None, refs):
        if not (src / ref).is_file():
            problems.append(f"manifest points at a missing file: src/{ref}")

    gecko_id = manifest.get("browser_specific_settings", {}).get("gecko", {}).get("id", "")
    if gecko_id.endswith("@example.com"):
        msg = f"gecko id is still the placeholder {gecko_id!r}; set an ID you own before uploading to AMO"
        (problems if release else warnings).append(msg)
    return manifest


def check_html(root: Path) -> None:
    for path in sorted((root / "src").rglob("*.html")):
        rel = path.relative_to(root)
        text = path.read_text()
        for m in re.finditer(r"<script\b([^>]*)>", text, re.I):
            if not re.search(r"\bsrc\s*=", m.group(1)):
                problems.append(f"{rel}: inline <script> (blocked by MV3 CSP; move it to a .js file)")
        if re.search(r"<[a-z][^>]*\son[a-z]+\s*=", text, re.I):
            problems.append(f"{rel}: inline on…= event handler (blocked by MV3 CSP; use addEventListener)")
        for m in re.finditer(r"<(script|link|img|iframe|source)\b[^>]*\b(?:src|href)\s*=\s*[\"']?((?:https?:)?//[^\"'\s>]+)", text, re.I):
            problems.append(f"{rel}: remote <{m.group(1)}> {m.group(2)} (no-network rule / MV3 remote-code ban)")


IMPORT_RE = re.compile(r"""^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]""", re.M)


def check_js(root: Path) -> None:
    for path in sorted((root / "src").rglob("*.js")):
        rel = path.relative_to(root)
        text = path.read_text()
        if re.search(r"\beval\s*\(|\bnew\s+Function\s*\(", text):
            problems.append(f"{rel}: eval / new Function (blocked by MV3 CSP)")
        if re.search(r"\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\s*\(|\bEventSource\b", text):
            warnings.append(f"{rel}: uses a network API; only acceptable for files inside the extension (no-network rule)")
        for m in IMPORT_RE.finditer(text):
            spec = m.group(1) or m.group(2)
            if not spec.startswith(("./", "../")) or not spec.endswith(".js"):
                problems.append(f"{rel}: import {spec!r} must be a relative path ending in .js (no bundler)")
            elif not (path.parent / spec).resolve().is_file():
                problems.append(f"{rel}: import {spec!r} does not exist")
        if "/lib/" in rel.as_posix() and re.search(r"\b(document|window|chrome|browser)\.\w", text):
            problems.append(f"{rel}: src/lib must stay free of DOM and extension APIs so Node can test it")


def run(label: str, cmd: list[str], root: Path, quiet: bool) -> bool:
    print(f"== {label}: {' '.join(cmd)}", flush=True)
    try:
        r = subprocess.run(cmd, cwd=root, capture_output=quiet, text=True)
    except FileNotFoundError:
        problems.append(f"{label}: {cmd[0]} not found on PATH")
        return False
    if r.returncode:
        if quiet:
            print(r.stdout + r.stderr)
        problems.append(f"{label} failed (exit {r.returncode})")
        return False
    if quiet:
        summary = [line for line in r.stdout.splitlines() if re.match(r"\S*\s*(tests|pass|fail)\s+\d+", line)]
        print("   " + ", ".join(s.strip("ℹ ").strip() for s in summary) if summary else "   ok")
    return True


def check_dist(root: Path, version: str) -> None:
    chrome = json.loads((root / "dist/chrome/manifest.json").read_text())
    if "browser_specific_settings" in chrome:
        problems.append("dist/chrome/manifest.json still contains browser_specific_settings")
    for target in ("firefox", "chrome"):
        zip_path = root / f"dist/tab-qr-{target}-{version}.zip"
        if not zip_path.is_file():
            problems.append(f"missing {zip_path.relative_to(root)}")
            continue
        with zipfile.ZipFile(zip_path) as z:
            if "manifest.json" not in z.namelist():
                problems.append(f"{zip_path.relative_to(root)}: manifest.json is not at the zip root")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lint", action="store_true", help="also run web-ext lint on dist/firefox")
    ap.add_argument("--release", action="store_true", help="fail on the placeholder gecko id")
    args = ap.parse_args()

    root = find_root()
    print(f"Tab QR checks in {root}")
    manifest = check_manifest(root, args.release)
    check_html(root)
    check_js(root)
    print(f"== static checks: {'ok' if not problems else f'{len(problems)} problem(s)'}")

    tests = sorted(str(p) for p in (root / "tests").glob("*.test.mjs"))
    if tests:
        run("unit tests", ["node", "--test", *tests], root, quiet=True)
    else:
        warnings.append("no tests/*.test.mjs files found")

    if run("build", [sys.executable, "build.py"], root, quiet=False):
        check_dist(root, manifest["version"])
        if args.lint:
            # Lint errors fail the check; lint warnings are printed for the user to judge.
            run("web-ext lint", ["npx", "--yes", "web-ext", "lint", "--source-dir", "dist/firefox"], root, quiet=False)

    print()
    for w in warnings:
        print(f"WARNING  {w}")
    for p in problems:
        print(f"PROBLEM  {p}")
    print("All checks passed." if not problems else f"{len(problems)} problem(s).")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
