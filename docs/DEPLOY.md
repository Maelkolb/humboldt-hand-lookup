# Deploying Humboldt's Hand

`site/` is the whole page: static files, no server code, no database. Every path inside it is relative, so it can
live at a domain's root or in any sub-folder.

| file | what it is |
|---|---|
| `site/index.html` | the page |
| `site/assets/app.js` | search, timeline, crops, detail view |
| `site/assets/style.css` | layout and type |
| `site/assets/fonts/` | EB Garamond (SIL Open Font License, `OFL.txt`) |
| `site/data/index.json` | the index: sources, pages, and lines placed character by character (see `DATA.md`) |

## On a web server
Copy `site/` to the server (Apache, nginx, eXist-db, GitHub Pages; anything that serves files).

- **Compression.** The index is 15.5 MB as JSON and 5.3 MB compressed, so let the server compress JSON. nginx:
  `gzip_types application/json;`. Apache: `AddOutputFilterByType DEFLATE application/json`. GitHub Pages does this
  by itself.
- **Images.** The crops come from BBAW digilib (`iiif_base` in the index). The page reads their pixels, which digilib
  allows from any origin (`Access-Control-Allow-Origin: *`). If the images move to another IIIF server, change
  `iiif_base` in the index and the two `preconnect` links in `index.html`.
- **Network.** The page needs its own server for its files and digilib for the images. Nothing else is loaded.

## On one computer
`python -m http.server -d site 8000`, then open http://localhost:8000.

Opening `site/index.html` straight from disk does not work, because browsers do not let a page read
`data/index.json` from `file://`. For a single file that opens from disk (on a USB stick, or next to an export of
the reading view), build `python tools/build.py single --out humboldt_hand_lookup.html`. That file has everything
inside it: 7.4 MB.

## A new index
The index is made by the humboldt-htr pipeline (`scripts/78_lookup_index.py`) from a release of the EHD TEI data.

1. `python tools/build.py data --index <path>/index.json` checks the schema and copies the index into `site/data/`.
2. Commit and push. GitHub Pages redeploys `site/` by itself (`.github/workflows/pages.yml`). On another server,
   copy `site/data/index.json` there.

## ediarum
The two oXygen actions in `ediarum/` open the page's address. If the page moves, change the one URL at the start of
each file in `ediarum/humboldt-hand/humboldt-hand_externalAuthorActions/`.

## A package to hand over
`python tools/build.py package` writes `dist/humboldt-hand-lookup-<built>.zip`. It contains `site/`, the ediarum
actions, `tools/build.py`, these documents, the README and the licence.
