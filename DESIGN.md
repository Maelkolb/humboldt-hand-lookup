# Design brief: Humboldt's Hand and the reading view

## Subject, readers, job
- **Subject:** Alexander von Humboldt's handwriting, 1790–1858, in 12 journals and 93 letters. Every crop is cut from a
  scan served by BBAW digilib, with the text taken from the edition humboldt digital.
- **Readers:** editors of the edition and researchers, in the middle of a transcription. They work with editions,
  TEI and oXygen every day.
- **The job:** settle an unclear word by putting it beside Humboldt's own instances of the candidates.
  - **The lookup** answers "how did he write this word, these letters, in this period".
  - **The reading view** is the workbench of a new document: scan, machine reading and doubts, line by line. Every
    word links into the lookup.

## Direction
- **Model:** the plate of a palaeography handbook (a Schrifttafel). Specimens are set on a neutral ground, aligned on
  their baseline and dated in the margin, with small captions and no decoration.
- **Material:** the palette comes from the sources and from editing.
  - Iron-gall ink for Humboldt's hand.
  - A grey, laid-paper ground.
  - The editor's blue pencil for everything that is ours: the unclear word, the hit letters, the machine's doubts,
    focus and current state.
- **Signature move, in one place only:** each row of specimens stands on a hairline baseline, like a copybook ruling.
  The crops really are aligned on their baselines, so the rule shows a fact, not ornament. Nowhere else gets rules
  beyond the section hairlines.

### Checked against the generic defaults
- The previous page used cream `#f6f2e9` with a red-brown accent: default 1 of frontend-design (cream, serif,
  terracotta). Replaced by a grey ground and the blue pencil, both taken from the material.
- Hairlines and zero radius are default 3. They stay, because the owner wants the edition look, but only as structure:
  section rules and the baseline ruling, not a newspaper grid.
- No hero, no counters with labels, no eyebrows, no "·", no cards, no icon set. Words name the things.

## Tokens

| token | light | dark | use |
|---|---|---|---|
| `--ground` | `#ECEBE6` | `#17181B` | page ground (`html`, `body`) |
| `--sheet` | `#F6F5F1` | `#1F2024` | raised surfaces: detail dialog, line panel, popovers |
| `--ink` | `#1C1915` | `#E9E5DD` | text |
| `--script` | `#2A1F15` | `#F0E8DA` | Humboldt's ink in the crops (masks) |
| `--muted` | `#5F5C55` | `#A3A097` | secondary text (contrast ≥ 4.5:1 on ground and sheet) |
| `--rule` | `#C9C6BC` | `#3A3B41` | section hairlines, control borders |
| `--ruling` | `#D6D3C9` | `#2C2D32` | the baseline ruling under specimen rows |
| `--pencil` | `#284A8C` | `#9BB3EA` | the editor's blue pencil: pinned word, hits, doubts, focus, current state |
| `--pencil-wash` | `rgba(40,74,140,.10)` | `rgba(155,179,234,.14)` | hover, selection, light marks |

- **Doubt levels** (reading view, replacing yellow/orange/red) are the blue pencil at three strengths:
  - < 70 % gets a dotted underline and a wash of .14;
  - < 30 % a solid underline and .24;
  - < 5 % a double underline and .36.
  The facsimile heat uses the same washes.
- **Browser surfaces:** `::selection` in `--pencil-wash` with ink text, `caret-color: var(--pencil)`, thin scrollbars
  in `--rule`, focus ring `2px solid var(--pencil)` with `outline-offset: 2px` on `:focus-visible` only.
- **Theming:** dark mode follows the house rule (`prefers-color-scheme` guarded by `:root:not([data-theme="light"])`,
  plus `:root[data-theme="dark"]`), with `color-scheme` set.

## Type
- **One family, EB Garamond** (embedded: regular and italic, 400–500), for everything including controls.
  - Oldstyle numerals in running text.
  - Lining tabular numerals (`"lnum","tnum"`) for years, counts, folios and the timeline.

| role | size / line | notes |
|---|---|---|
| search field | 30 / 1.2 | the page's main element |
| term (result heading) | 34 / 1.1 | the word or `„st“` |
| margin date | 22 / 1.15 | lining figures, in the gutter of each row |
| body, edition line | 18 / 1.45 | reading measure ≤ 70ch |
| source name, captions | 16 / 1.3 | italic for source names |
| small (counts, controls, legends) | 15 / 1.3 | |

- Sentence case throughout. No all-caps or letter-spaced labels.

## Controls
- **Toggles are typographic:** a word in `--muted`, the current one in `--ink` with a 1.5 px `--pencil` underline
  (offset 5 px). This covers Word/Letters, Aa, Confidence and Layout. No filled black boxes.
- **Buttons are words** ("12 more", "Close", "Line", "Page"). The few icon buttons (×, ←, →, ↑, ↓, + −) get an
  `aria-label`, a 32 px hit area, and hover in `--ink`.
- **The search field** has a hairline underline that turns `--pencil` on focus, and no box.
- **Hover:** a `--pencil-wash` behind specimens and words. No shadows, no scale.

## The lookup (`ui/`)
```
Humboldt's Hand  │ Wasser|Waller______________________________  Word  Letters  Aa
                 │ 1790 ▁▂▅▃▁   ▂▇▃      ▁       ▂▃▅▂▁▂▃▂▁▂▃▁   1858   (timeline, thin)
─────────────────┼───────────────────────────────────────────────────────────────
Wasser           │ 231 in 19 sources
                 │
1790             │ [crop]   [crop]   [crop]
England          │ ──────────────────────────────────────────── (baseline ruling)
                 │
1795–1799        │ [crop] [crop] [crop] [crop] [crop]
Letters   5 more │ ──────────────────────────────────────────────
```
- **Gutter:** date (22, lining figures), source name (16, italic, muted), "N more". The date's baseline sits on the
  row's ruling.
- **Guesses:** one band per guess, with the term in the gutter. The pinned word comes first in blue pencil, with a
  short vertical hairline after it.
- **Letters:** the hit in full ink with the rest of the word faint (as now). The caption under each crop shows the
  whole word with the hit in `--pencil`.
- **Detail:** a sheet over the page (`--sheet`), not a black overlay. It holds:
  - the instance large;
  - the edition line with the word underlined in pencil;
  - source, date and folio as plain lines;
  - the page viewer.
  It has steps ← → and Close; Esc closes it and focus returns to the crop.
- **Landing:** title, search, timeline with era names, and one line on the corpus. Nothing else.
- **Fixed, do not change:**
  - the crop pipeline: `inkPart`, `shapeInk`, `inkAlpha` and their constants;
  - the hash contract: `q`, `y`, `case`, `pin`, `box`, `d`;
  - the features: Word, Letters, Aa, guesses, pin from the link, year range, detail;
  - single file, works from `file://`.

## The reading view (`viewer_ui/`)
```
Testdoc                    ← 52r →  (folio select)                 Confidence   Layout
──────────────────────────────────────────────────────────────────────────────────────
┌ scan (zoom, pan) ─────────┐ │  52.
│                           │ │  Der 24 Okt. 98. war zu unserer Ankunft in Marseille
│                           │ │  bestimmt. So lange hatte Herr Skoldebrand die Schwed.
└───────────────────────────┘ │  (reading measure, line spans clickable)
──────────────────────────────────────────────────────────────────────────────────────
Line 21 of 40                                                                ↑  ↓  ×
[ line crop: baseline -0.92 to +0.74 of the line's ink reach, neighbours veiled ]
  Wie    anders    war    es    mir    als    ich    den    ersten    Abend
  (each word centred under its own ink; click opens the lookup with this word pinned)
TrOCR   Wie anders war es mir als ich den ersten Abend
Qwen    Wie anders war es mir als ich den ersten Abend
```
- **The facing spread:** scan left, text right, a hairline between them, like a synoptic edition. The text pane is
  set at reading measure.
- **The line panel** sits on `--sheet` with a hairline on top.
  - The line crop uses the lookup's geometry, so ascenders and descenders are whole.
  - The words are set in the reading face under their own ink: no squeezing, and long words may run past their box.
  - The doubt marks are the pencil underlines.
  - Clicking a word opens the lookup, with the guesses and the pin crop in the lookup's own geometry.
- **Compare and Edition** appear only when the page has edition truth.
- **The confidence legend** is three underline samples with their thresholds, computed rather than hard-coded.

## Quality floor (both pages)
- 390 px without horizontal scroll, 1400 px, light and dark, keyboard focus visible.
- `prefers-reduced-motion` respected: fades only, no motion.
- Images have dimensions.
- `…` for loading states.
- Contrast ≥ 4.5:1 for text.
- Close with the `web-design-guidelines` audit.
