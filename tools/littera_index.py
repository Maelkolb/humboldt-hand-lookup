"""The index from littera placements: `humboldt-htr/scripts/78_lookup_index.py` with littera's slant, line centre and
x-height, for placement files made by littera's `modal/humboldt_index.py`.

  uv run --project ../humboldt-htr python tools/littera_index.py --place <dir>/<tag> --model "littera-humboldt-ft2 (snap upright)" --out <index.json>

Needs the humboldt-htr checkout beside this one (match files in `data/lookup/lines`, the edition's lines in `data/gt`).
"""
import argparse
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import quote

HTR = Path(__file__).resolve().parents[2] / "humboldt-htr"
sys.path.insert(0, str(HTR / "src"))

from humboldt_htr.crops import fragments_box  # noqa: E402
from humboldt_htr.facsimiles import IIIF_BASE, PAGE_VIEW, SECTION  # noqa: E402
from humboldt_htr.journals import JOURNALS  # noqa: E402
from humboldt_htr.lookup import GROW, baseline, reach  # noqa: E402

DATA = HTR / "data"
SCHEMA = "humboldt-hand-lookup/1"
PRINT_ONLY = {"H0020422"}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def documents() -> dict[str, dict]:
    docs = {j.id: {"id": j.id, "kind": "journal", "title": j.title, "date": j.year} for j in JOURNALS if j.hand == "humboldt"}
    for name in ("letters.json", "letters_train.json"):
        for letter in read_json(DATA / name):
            docs[letter["id"]] = {"id": letter["id"], "kind": "letter", "title": letter["title"], "date": letter["date"]}
    for doc in docs.values():
        doc["year"] = int(re.search(r"\d{4}", doc["date"]).group())
    return docs


def confidence_digits(text: str, flags: str, q: list[float], visible: list[bool]) -> str:
    digits = []
    for ch, flag, value, seen in zip(text, flags, q, visible):
        if ch == " ":
            digits.append(None)
        elif flag == "a" or not seen:
            digits.append(0)
        else:
            digits.append(max(1, min(9, round(9 * value))))
    for i, d in enumerate(digits):
        if d is None:
            around = [digits[k] for k in (i - 1, i + 1) if 0 <= k < len(digits) and digits[k]]
            digits[i] = min(around) if around else 9
    return "".join(str(d) for d in digits)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--place", required=True, help="folder of placement files <doc>/<page>.json")
    ap.add_argument("--model", required=True)
    ap.add_argument("--gate", type=float, default=0.2)
    ap.add_argument("--max-unplaced", type=int, default=8)
    ap.add_argument("--max-unsure", type=float, default=0.3)
    ap.add_argument("--out", required=True)
    ap.add_argument("--keep-ids", action="store_true", help="keep each line's edition id as `id` (for comparisons, not for the site)")
    args = ap.parse_args()

    docs = documents()
    files = [f for f in sorted((DATA / "lookup" / "lines").glob("*/*.json")) if f.parent.name not in PRINT_ONLY]
    page_order, next_line = {}, {}
    for doc_id in {f.parent.name for f in files}:
        for page in read_json(DATA / "gt" / f"{doc_id}.json")["pages"]:
            page_order[page["page_id"]] = page["index"]
            for zone in page["zones"]:
                for a, b in zip(zone["lines"], zone["lines"][1:]):
                    if a.get("wordbreak"):
                        next_line[a["id"]] = b["id"]
    files.sort(key=lambda f: (docs[f.parent.name]["year"], f.parent.name, page_order.get(f.stem, 0)))

    sources, pages, lines = [], [], []
    source_index: dict[str, int] = {}
    dropped = Counter()
    for f in files:
        match = read_json(f)
        doc_id = match["journal"]
        place_file = Path(args.place) / doc_id / f.name
        placed = read_json(place_file) if place_file.exists() else {}
        (W, H), (w, h) = match["native"], match["local"]
        sx, sy = W / w, H / h
        keep = []
        for ln in match["lines"]:
            r = placed.get(ln["id"])
            if r is None or r["t"] != ln["t"] or r["x0"] != fragments_box((w, h), ln["pieces"], pad=max(8, GROW))[0]:
                dropped["not placed"] += 1
                continue
            if r["lq"] < args.gate:
                dropped["gate"] += 1
                continue
            digits = confidence_digits(ln["t"], ln["f"], r["q"], r["visible"])
            gated = "".join("9" if flag == "a" else d for d, flag in zip(digits, ln["f"]))
            if max((len(run) for run in re.findall(r"0+", gated)), default=0) >= args.max_unplaced:
                dropped["unplaced run"] += 1
                continue
            if gated.count("0") > args.max_unsure * len(gated):
                dropped["unsure"] += 1
                continue
            b = baseline(ln["pieces"], sx, sy)
            if not b:
                dropped["no baseline"] += 1
                continue
            ink = r.get("ink")
            a, d = (round(ink["a"] * sy), round(ink["d"] * sy)) if ink else reach(ln["pieces"], sy)
            entry = {"id": ln["id"], "t": ln["t"], "x": [round(c * sx) for c in r["cuts"]], "b": b, "a": a, "d": d, "k": ln["k"],
                     "f": ln["f"], "q": digits, "lq": round(r["lq"], 3)}
            if ink:
                entry["wy"] = [[round(top * sy), round(bottom * sy)] for top, bottom in ink["wy"]]
            entry["sl"] = round(r["sl"], 3)
            entry["xh"] = round(r["xh"] * sy)
            entry["co"] = round((r["co"] or 0) * sy)
            keep.append(entry)
        if not keep:
            continue
        if doc_id not in source_index:
            source_index[doc_id] = len(sources)
            sources.append(docs[doc_id])
        kind = docs[doc_id]["kind"]
        pages.append({"id": match["page_id"], "s": source_index[doc_id], "folio": match["folio"], "iiif": match["iiif"], "w": W, "h": H,
                      "url": PAGE_VIEW.format(section=SECTION[kind], journal=doc_id, page=quote(match["n_raw"] or match["folio"]))})
        position = {ln["id"]: len(lines) + k for k, ln in enumerate(keep)}
        for ln in keep:
            lid = ln["id"] if args.keep_ids else ln.pop("id")
            if next_line.get(lid) in position:
                ln["j"] = position[next_line[lid]]
            lines.append({"p": len(pages) - 1, **ln})

    index = {"schema": SCHEMA, "built": date.today().isoformat(), "model": args.model, "iiif_base": IIIF_BASE, "sources": sources,
             "pages": pages, "lines": lines}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(sources)} sources, {len(pages)} pages, {len(lines)} lines -> {out} ({out.stat().st_size / 1e6:.1f} MB); dropped {dict(dropped)}")


if __name__ == "__main__":
    main()
