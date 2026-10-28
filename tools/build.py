"""Humboldt's Hand: put a new index into the site, build the single-file page, or package the site for delivery.

  python tools/build.py data [--index ../humboldt-htr/data/lookup/index.json]
  python tools/build.py single [--out humboldt_hand_lookup.html]
  python tools/build.py package [--out dist/humboldt-hand-lookup-<built>.zip]
"""
import argparse
import base64
import gzip
import json
import re
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DATA = SITE / "data" / "index.json"
DEFAULT_INDEX = ROOT.parent / "humboldt-htr" / "data" / "lookup" / "index.json"
SCHEMA = "humboldt-hand-lookup/1"
PACKAGE = ["site", "ediarum/humboldt-hand", "ediarum/README.md", "tools/build.py", "docs/DEPLOY.md", "docs/DATA.md",
           "docs/shots/wasser_1400_light.png",
           "README.md", "LICENSE"]


def read_index(path: Path) -> dict:
    index = json.loads(path.read_text(encoding="utf-8"))
    if index.get("schema") != SCHEMA:
        raise SystemExit(f"{path}: schema {index.get('schema')!r}, expected {SCHEMA!r}")
    return index


def check_origin(index: dict) -> None:
    iiif = urlsplit(index["iiif_base"])
    origin = f"{iiif.scheme}://{iiif.netloc}"
    if f'href="{origin}"' not in (SITE / "index.html").read_text(encoding="utf-8"):
        print(f"note: the index serves images from {origin}; change the preconnect links in site/index.html to match")


def data(args) -> None:
    source = Path(args.index)
    index = read_index(source)
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_bytes(source.read_bytes())
    check_origin(index)
    counts = {key: len(index[key]) for key in ("sources", "pages", "lines")}
    print(f"{DATA.relative_to(ROOT)} {DATA.stat().st_size / 1e6:.1f} MB, built {index['built']}, {counts}")


def inline_fonts(css: str) -> str:
    def encode(match: re.Match) -> str:
        font = (SITE / "assets" / match.group(1)).read_bytes()
        return f'url(data:font/woff2;base64,{base64.b64encode(font).decode()})'

    return re.sub(r'url\("(fonts/[^"]+\.woff2)"\)', encode, css)


def single(args) -> None:
    read_index(DATA)
    page = (SITE / "index.html").read_text(encoding="utf-8")
    css = inline_fonts((SITE / "assets" / "style.css").read_text(encoding="utf-8"))
    js = (SITE / "assets" / "app.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    packed = base64.b64encode(gzip.compress(DATA.read_bytes(), 9, mtime=0)).decode()
    page = re.sub(r'<link rel="preload"[^>]*>\n', "", page)
    page = page.replace('<link rel="stylesheet" href="assets/style.css">', f"<style>\n{css}</style>")
    page = page.replace('<script src="assets/app.js"></script>',
                        f'<script id="data" type="application/octet-stream">{packed}</script>\n<script>\n{js}</script>')
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    print(f"{out} {out.stat().st_size / 1e6:.1f} MB")


def package(args) -> None:
    index = read_index(DATA)
    out = Path(args.out or ROOT / "dist" / f"humboldt-hand-lookup-{index['built']}.zip")
    out.parent.mkdir(parents=True, exist_ok=True)
    top = out.stem
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for entry in PACKAGE:
            path = ROOT / entry
            files = sorted(p for p in path.rglob("*") if p.is_file()) if path.is_dir() else [path]
            for file in files:
                if file.suffix == ".framework" or "__pycache__" in file.parts:
                    continue
                archive.write(file, f"{top}/{file.relative_to(ROOT).as_posix()}")
    print(f"{out} {out.stat().st_size / 1e6:.1f} MB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("data", help="copy a humboldt-hand-lookup/1 index into site/data")
    command.add_argument("--index", default=str(DEFAULT_INDEX))
    command.set_defaults(run=data)
    command = commands.add_parser("single", help="one HTML file with everything inside, for use from disk")
    command.add_argument("--out", default=str(ROOT / "dist" / "humboldt_hand_lookup.html"))
    command.set_defaults(run=single)
    command = commands.add_parser("package", help="zip the site with its documentation for delivery")
    command.add_argument("--out")
    command.set_defaults(run=package)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
