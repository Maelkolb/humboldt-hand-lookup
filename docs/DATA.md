# The index: `humboldt-hand-lookup/1`

`site/data/index.json` is one JSON object. Image coordinates are pixels of the full digilib image of the page.

| key | value |
|---|---|
| `schema` | `humboldt-hand-lookup/1` |
| `built` | date the index was made |
| `model` | the aligner that placed the characters |
| `iiif_base` | IIIF Image API base; an image is `<iiif_base><page.iiif>/<region>/<size>/0/default.jpg` |
| `sources` | the documents, in order |
| `pages` | the pages with a scan, in order |
| `lines` | the placed lines, in order |

## `sources[]`

| key | value |
|---|---|
| `id` | EHD document id, e.g. `H0016412` |
| `kind` | `journal` or `letter` |
| `title` | the edition's title |
| `date` | date as shown, e.g. `1799–1800` |
| `year` | year used by the timeline |

## `pages[]`

| key | value |
|---|---|
| `id` | page id |
| `s` | index of its source in `sources` |
| `folio` | folio as in the edition |
| `iiif` | digilib image id |
| `w`, `h` | size of the full image |
| `url` | the page in the edition's own viewer |

## `lines[]`

| key | value |
|---|---|
| `p` | index of its page in `pages` |
| `t` | the edition's text of the line, struck words kept |
| `x` | `len(t) + 1` positions on the line: character `i` runs from `x[i]` to `x[i + 1]` |
| `b` | the baseline as points `[x, y]` |
| `a`, `d` | how far the ink reaches above and below the baseline |
| `k` | the zone kind in the edition: `para`, `note`, `table`, `list`, `addition`, `heading`, `fw`, `figure` |
| `f` | one flag per character: `s` struck, `a` added above the line, `u` unclear, `l` Latin script, `.` none |
| `q` | one digit per character: the aligner's confidence, 0 (not placed) to 9 |
| `lq` | how well the line's text fits the line on the scan, 0 to 1 |
| `wy` | per word (split at spaces): the ink's top and bottom, `[top, bottom]`; missing where the ink was too thin |
| `j` | where the edition marks a word broken at the line's end: index of the line that continues it |

The text and its markup come from the edition humboldt digital (CC BY-SA 4.0); the index is shared under the same
licence.
