#!/usr/bin/env python3
"""Package src/ for Firefox and Chrome.

dist/firefox/  + dist/tab-qr-firefox-<version>.zip  (manifest as-is)
dist/chrome/   + dist/tab-qr-chrome-<version>.zip   (browser_specific_settings removed,
                                                    so Chrome shows no "unrecognized key" warning)
"""
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"


def build(target: str, manifest: dict) -> Path:
    out = DIST / target
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(SRC, out)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    zip_path = DIST / f"tab-qr-{target}-{manifest['version']}.zip"
    zip_path.unlink(missing_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(out).as_posix())  # manifest.json at zip root
    return zip_path


def main() -> None:
    DIST.mkdir(exist_ok=True)
    manifest = json.loads((SRC / "manifest.json").read_text())

    chrome = {k: v for k, v in manifest.items() if k != "browser_specific_settings"}
    for target, m in (("firefox", manifest), ("chrome", chrome)):
        print("built", build(target, m).relative_to(ROOT))


if __name__ == "__main__":
    main()
