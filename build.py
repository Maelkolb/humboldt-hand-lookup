"""Builds the single-file lookup page from a humboldt-hand-lookup/1 index (gzip + base64 embedded): ui/ -> index.html."""
import argparse
import base64
import gzip
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
UI = ROOT / "ui"
DEFAULT_INDEX = ROOT.parent / "humboldt-htr" / "data" / "lookup" / "index.json"

FONT_FILES = [
    ("normal", "n-latin.woff2", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212"),
    ("normal", "n-ext.woff2", "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+2113, U+A720-A7FF"),
    ("italic", "i-latin.woff2", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212"),
    ("italic", "i-ext.woff2", "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+2113, U+A720-A7FF"),
]


def font_css():
    rules = []
    for style, name, unicode_range in FONT_FILES:
        encoded = base64.b64encode((UI / "fonts" / name).read_bytes()).decode()
        rules.append(
            f'@font-face {{ font-family: "EB Garamond"; font-style: {style}; font-weight: 400 500; font-display: swap; '
            f'src: url(data:font/woff2;base64,{encoded}) format("woff2"); unicode-range: {unicode_range}; }}'
        )
    return "\n".join(rules)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--index", default=str(DEFAULT_INDEX))
    parser.add_argument("--out", default=str(ROOT / "index.html"))
    args = parser.parse_args()

    raw = Path(args.index).read_bytes()
    packed = base64.b64encode(gzip.compress(raw, 9, mtime=0)).decode()
    iiif = urlsplit(json.loads(raw)["iiif_base"])
    html = (UI / "template.html").read_text(encoding="utf-8")
    html = html.replace("/*IIIF_ORIGIN*/", f"{iiif.scheme}://{iiif.netloc}")
    html = html.replace("/*FONTS*/", font_css())
    html = html.replace("/*CSS*/", (UI / "style.css").read_text(encoding="utf-8"))
    html = html.replace("/*JS*/", (UI / "app.js").read_text(encoding="utf-8").replace("</script", "<\\/script"))
    html = html.replace("/*DATA*/", packed)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"{out} {out.stat().st_size / 1e6:.1f} MB (index {len(raw) / 1e6:.1f} MB raw)")


if __name__ == "__main__":
    main()
