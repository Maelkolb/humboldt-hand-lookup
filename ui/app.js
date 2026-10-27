"use strict";

const TEXT = {
  title: "Humboldt’s hand",
  skip: "Skip to results",
  placeholder: "Wasser|Waller…",
  lookUp: "Word to look up",
  lookUpBy: "Look up by",
  suggestions: "Words in the edition",
  word: "Word",
  letters: "Letters",
  matchCase: "Match case",
  remove: "Remove the pinned word",
  pinnedWord: "Pinned word",
  close: "Close",
  back: "Previous",
  next: "Next",
  from: "From year",
  to: "To year",
  loading: "Loading…",
  loadingIndex: "Loading the index…",
  buildingIndex: "Building the word index…",
  indexFailed: (reason) => `The index could not be read (${reason}). Reload the page; if it fails again, rebuild it with build.py.`,
  noHit: "Not in the edition.",
  noLetters: (term) => `No word contains ${term}.`,
  noneInYears: (range) => `None in ${range}.`,
  journal: "Journal",
  letter: "Letter",
  letterGroup: "Letters",
  folio: "fol.",
  struck: "struck",
  lineFit: "Line fit",
  pageInEdition: "Page in the edition",
  pageScan: (folio) => (folio ? `Page scan, fol. ${folio}` : "Page scan"),
  imageFailed: "The page image did not load from digilib. Check the connection, then step away and back.",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomLine: "Line",
  zoomLineLabel: "Zoom to the line",
  zoomPage: "Page",
  zoomPageLabel: "Whole page",
  allYears: "All years",
  pinned: "Pinned word",
  more: (n) => `${n} more`,
  position: (i, n) => `${i} of ${n}`,
  summary: (n, sources) => `${n} in ${sources} ${sources === 1 ? "source" : "sources"}`,
  corpus: (lines, words, journals, letters) => `${lines} lines and ${words} words from ${journals} journals and ${letters} letters`,
};

const SHORT = {
  H0017682: "England",
  H0019734: "Dresden, Vienna, Salzburg",
  H0018407: "Paris to Toulon",
  H0016412: "Spain, Canaries, Cumaná",
  H0018406: "Valencia to Madrid",
  H0019154: "Caripe",
  H1242132: "Cumaná to Villa de Cura",
  H0019162: "Galvanism",
  H0002922: "Cuba",
  H0019155: "Italy",
  H0020388: "Index of manuscripts",
  H0005449: "Siberia",
};

const ERAS = {
  H0017682: "England",
  H0016412: "America",
  H0002922: "America",
  H0019155: "Italy",
  H0005449: "Siberia",
};

const SIZES = {
  wide: { ink: 52, letters: 58, band: 60, detail: 100, gap: 20, caption: 16 },
  narrow: { ink: 38, letters: 42, band: 44, detail: 64, gap: 12, caption: 15 },
};

const ABOVE = 0.92;
const BELOW = 0.74;
const WORD_LEFT = 0.25;
const WORD_RIGHT = 0.4;
const LETTER_PAD = 0.5;
const LETTER_SHARP = 0.12;
const LETTER_SOFT = 0.3;
const FAINT = 0.24;
const INK_CUT = 64;

const IMAGE_LIMIT = 6;
const MAX_TERMS = 6;
const JOIN_GAP = 9;
const PIN_RULE = 15;
const BREAK_CHARS = "-¬";
const OPEN_QUOTES = "\"„“«»”";
const FOLDS = { "ſ": "s", "ß": "ss", "ä": "ae", "ö": "oe", "ü": "ue", "æ": "ae", "œ": "oe" };

const $ = (selector, root = document) => root.querySelector(selector);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const isWordChar = (ch) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
const formatNumber = (n) => n.toLocaleString("en-US");
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const foldCache = new Map();
function foldChar(ch) {
  let folded = foldCache.get(ch);
  if (folded === undefined) {
    const lower = ch.toLowerCase();
    folded = FOLDS[lower] ?? lower.normalize("NFD").replace(/\p{M}/gu, "");
    foldCache.set(ch, folded);
  }
  return folded;
}
const foldString = (text) => Array.from(text, foldChar).join("");

const JOIN_HEAD = /^\s*([\p{L}\p{M}\p{N}]+)/u;

function lowerExact(ch) {
  const lower = ch.toLowerCase();
  return lower.length === ch.length ? lower : ch;
}

function buildJoins(lines, wordPattern, keyCount, keyShown) {
  const flagged = lines.some((line) => line.j !== undefined);
  const byKey = new Map();
  for (let li = 0; li + 1 < lines.length; li++) {
    const line = lines[li];
    const target = flagged ? (line.j === 1 && li !== 0 ? li + 1 : line.j) : li + 1;
    const next = lines[target];
    if (!next || target === li || next.p !== line.p) continue;
    const text = line.t.trimEnd();
    const broken = BREAK_CHARS.includes(text.slice(-1));
    if (flagged ? line.j === undefined : !broken) continue;
    const tail = Array.from((broken ? text.slice(0, -1) : text).matchAll(wordPattern)).pop();
    const head = next.t.match(JOIN_HEAD);
    if (!tail || !head) continue;
    const start = head[0].length - head[1].length;
    const entry = { li, next: target, i: tail.index, j: tail.index + tail[0].length, ni: start, nj: start + head[1].length };
    const key = foldString(tail[0] + head[1]);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
    if (!keyShown.has(key)) keyShown.set(key, (tail[0] + head[1]).toLowerCase().replace(/ſ/g, "s"));
  }
  return byKey;
}

let corpus = null;
let mode = "word";
let matchCase = false;
let yearRange = [0, 9999];
let yearFull = [0, 9999];
let views = [];
let runId = 0;
let detail = null;
let pin = null;
let pinHash = "";
let sizes = currentSizes();

function currentSizes() {
  return window.innerWidth < 720 ? SIZES.narrow : SIZES.wide;
}

async function loadData() {
  const encoded = $("#data").textContent.trim();
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

function buildGroups(sources, pages, lines) {
  const groups = [];
  const byKey = new Map();
  const sourceGroup = sources.map((source) => {
    const journal = source.kind === "journal";
    const key = journal ? source.id : `letters ${Math.floor(source.year / 10) * 10}`;
    if (!byKey.has(key)) {
      byKey.set(key, groups.length);
      groups.push({ key, journal, sources: [], first: source.year, last: source.year, lines: 0 });
    }
    const group = groups[byKey.get(key)];
    group.sources.push(source);
    group.first = Math.min(group.first, source.year);
    group.last = Math.max(group.last, source.year);
    return byKey.get(key);
  });
  const lineGroup = new Uint16Array(lines.length);
  lines.forEach((line, li) => {
    lineGroup[li] = sourceGroup[pages[line.p].s];
    groups[lineGroup[li]].lines++;
  });
  for (const group of groups) {
    const source = group.sources[0];
    group.name = group.journal ? SHORT[source.id] ?? source.title : TEXT.letterGroup;
    group.title = group.journal ? source.title : "";
    group.date = group.journal ? source.date || String(source.year) : group.first === group.last ? String(group.first) : `${group.first}–${group.last}`;
  }
  const order = groups.map((_, g) => g).sort((a, b) => groups[a].first - groups[b].first || groups[b].journal - groups[a].journal || a - b);
  const groupRank = new Uint16Array(groups.length);
  order.forEach((g, rank) => (groupRank[g] = rank));
  return { groups, lineGroup, groupRank };
}

function buildCorpus(data) {
  const { lines, pages, sources } = data;
  const lineOff = new Uint32Array(lines.length + 1);
  const lineYear = new Int16Array(lines.length);
  const folded = new Array(lines.length);
  const keyCount = new Map();
  const keyShown = new Map();
  let total = 0;
  let words = 0;
  const wordPattern = /[\p{L}\p{M}\p{N}]+/gu;
  lines.forEach((line, li) => {
    lineYear[li] = sources[pages[line.p].s].year;
    folded[li] = foldString(line.t);
    lineOff[li] = total;
    total += folded[li].length + 1;
    const text = line.t;
    const broken = BREAK_CHARS.includes(text.trimEnd().slice(-1));
    const lastEnd = text.trimEnd().length - 1;
    for (const m of text.matchAll(wordPattern)) {
      const fragment = broken && m.index + m[0].length === lastEnd;
      const key = foldString(m[0]) + (fragment ? "-" : "");
      keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
      if (!keyShown.has(key)) keyShown.set(key, m[0].toLowerCase().replace(/ſ/g, "s") + (fragment ? "-" : ""));
      words++;
    }
  });
  lineOff[lines.length] = total;
  const exactOff = new Uint32Array(lines.length + 1);
  const exactParts = lines.map((line, li) => {
    const text = Array.from(line.t, lowerExact).join("");
    exactOff[li + 1] = exactOff[li] + text.length + 1;
    return text;
  });
  const map = new Uint32Array(total);
  lines.forEach((line, li) => {
    let at = lineOff[li];
    let index = 0;
    for (const ch of line.t) {
      const length = foldChar(ch).length;
      for (let k = 0; k < length; k++) map[at++] = index;
      index += ch.length;
    }
  });
  return {
    data, lines, pages, sources, lineOff, lineYear, map, words,
    ...buildGroups(sources, pages, lines),
    big: folded.join("\n") + "\n",
    exact: exactParts.join("\n") + "\n",
    cased: lines.map((line) => line.t).join("\n") + "\n",
    exactOff,
    joins: buildJoins(lines, wordPattern, keyCount, keyShown),
    keyCount, keyShown,
    keys: Array.from(keyCount.keys()).sort(),
    base: data.iiif_base,
  };
}

function lowerBound(sorted, prefix) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function completions(prefix, limit = 9) {
  const found = [];
  for (let k = lowerBound(corpus.keys, prefix); k < corpus.keys.length && found.length < 5000; k++) {
    const key = corpus.keys[k];
    if (!key.startsWith(prefix)) break;
    found.push(key);
  }
  found.sort((a, b) => corpus.keyCount.get(b) - corpus.keyCount.get(a));
  return found.slice(0, limit).map((key) => ({ key, shown: corpus.keyShown.get(key), n: corpus.keyCount.get(key) }));
}

function editDistance(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

function nearWords(folded) {
  const cap = folded.length <= 4 ? 1 : 2;
  const found = [];
  for (const key of corpus.keys) {
    if (key.endsWith("-") || Math.abs(key.length - folded.length) > cap) continue;
    if (editDistance(folded, key, cap) <= cap) found.push(key);
  }
  found.sort((a, b) => corpus.keyCount.get(b) - corpus.keyCount.get(a));
  return found.slice(0, 7).map((key) => ({ key, shown: corpus.keyShown.get(key), n: corpus.keyCount.get(key) }));
}

function parseQuery(text) {
  const terms = [];
  for (const piece of text.split("|")) {
    const raw = piece.trim();
    if (!raw) continue;
    const quoted = OPEN_QUOTES.includes(raw[0]);
    const inner = quoted ? raw.slice(1).replace(new RegExp(`[${OPEN_QUOTES}]+$`), "").trim() : raw;
    const cased = quoted && matchCase;
    const folded = cased ? inner : quoted ? Array.from(inner, lowerExact).join("") : foldString(inner).replace(/\s+/g, " ");
    if (!folded) continue;
    terms.push({ raw, inner, folded, letters: quoted, cased });
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

function inYears(year) {
  return year >= yearRange[0] && year <= yearRange[1];
}

function findInstances(term) {
  const space = term.letters
    ? { big: term.cased ? corpus.cased : corpus.exact, off: corpus.exactOff, map: null }
    : { big: corpus.big, off: corpus.lineOff, map: corpus.map };
  const needle = term.folded;
  const starts = [];
  const lineOf = [];
  const joinRef = new Map();
  const perYear = new Map();
  const count = (year) => perYear.set(year, (perYear.get(year) ?? 0) + 1);
  let li = 0;
  let at = space.big.indexOf(needle);
  while (at !== -1) {
    const end = at + needle.length;
    while (space.off[li + 1] <= at) li++;
    if (accepts(term, space, at, end, li)) {
      count(corpus.lineYear[li]);
      if (inYears(corpus.lineYear[li])) {
        starts.push(at);
        lineOf.push(li);
      }
    }
    at = space.big.indexOf(needle, at + 1);
  }
  if (!term.letters) {
    for (const entry of corpus.joins.get(needle) ?? []) {
      count(corpus.lineYear[entry.li]);
      if (!inYears(corpus.lineYear[entry.li])) continue;
      joinRef.set(starts.length, entry);
      starts.push(-1);
      lineOf.push(entry.li);
    }
  }
  const result = { space, starts, lineOf, joinRef, perYear, length: needle.length };
  const total = starts.length;
  const score = new Float32Array(total);
  for (let m = 0; m < total; m++) score[m] = scoreOf(result, m);
  const order = new Uint32Array(total);
  for (let m = 0; m < total; m++) order[m] = m;
  order.sort((a, b) => score[b] - score[a]);
  result.order = order;
  return result;
}

function spanOf(result, m) {
  const { space, starts, lineOf, length } = result;
  if (!space.map) {
    const i = starts[m] - space.off[lineOf[m]];
    return { i, j: i + length };
  }
  return { i: space.map[starts[m]], j: space.map[starts[m] + length - 1] + 1 };
}

function scoreOf(result, m) {
  const li = result.lineOf[m];
  const entry = result.joinRef.get(m);
  if (entry) {
    const first = placementScore(corpus.lines[li], entry.i, entry.j);
    return (first + placementScore(corpus.lines[entry.next], entry.ni, entry.nj)) / 2;
  }
  const { i, j } = spanOf(result, m);
  return placementScore(corpus.lines[li], i, j);
}

function accepts(term, space, at, end, li) {
  if (term.letters) return true;
  const { big, map, off } = space;
  const lineEnd = off[li + 1] - 1;
  if (at !== off[li] && map[at] === map[at - 1]) return false;
  if (end !== lineEnd && map[end] === map[end - 1]) return false;
  if (isWordChar(big[at - 1]) || isWordChar(big[end])) return false;
  if (!term.folded.endsWith("-") && BREAK_CHARS.includes(big[end]) && end + 1 === lineEnd) return false;
  return true;
}

function placementScore(line, i, j) {
  const q = line.q || "";
  let sum = 0;
  let n = 0;
  for (let k = i; k < j; k++) {
    sum += q.charCodeAt(k) - 48;
    n++;
  }
  const mean = n && !Number.isNaN(sum) ? sum / n / 9 : 0.5;
  return mean * (0.4 + 0.6 * (line.lq ?? 0.5));
}

function instance(result, m) {
  const li = result.lineOf[m];
  const line = corpus.lines[li];
  const page = corpus.pages[line.p];
  const base = { m, li, line, page, source: corpus.sources[page.s], year: corpus.lineYear[li] };
  const entry = result.joinRef.get(m);
  if (entry) {
    const join = { line: corpus.lines[entry.next], ni: entry.ni, nj: entry.nj };
    return { ...base, i: entry.i, j: entry.j, join };
  }
  return { ...base, ...spanOf(result, m) };
}

function isStruck(inst) {
  const own = (inst.line.f || "").slice(inst.i, inst.j).includes("s");
  return own || Boolean(inst.join && (inst.join.line.f || "").slice(inst.join.ni, inst.join.nj).includes("s"));
}

function baselineAt(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let k = 1; k < points.length; k++) {
    const [x1, y1] = points[k];
    const [x0, y0] = points[k - 1];
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

function wordBand(line, i, j) {
  if (!line.wy) return null;
  if (!line.wordSpans) line.wordSpans = Array.from(line.t.matchAll(/\S+/g), (m) => [m.index, m.index + m[0].length]);
  if (line.wordSpans.length !== line.wy.length) return null;
  let top = Infinity;
  let bottom = -Infinity;
  line.wordSpans.forEach(([start, end], k) => {
    if (start < j && end > i && line.wy[k]) {
      top = Math.min(top, line.wy[k][0]);
      bottom = Math.max(bottom, line.wy[k][1]);
    }
  });
  return top < bottom ? [top, bottom] : null;
}

function spanRect(line, page, i, j, padX, padY, useBand = true) {
  const a = line.a ?? 60;
  const d = line.d ?? 40;
  const left = line.x[i] - padX;
  const right = line.x[j] + padX;
  const ys = [baselineAt(line.b, left), baselineAt(line.b, right)];
  for (const [x, y] of line.b) if (x > left && x < right) ys.push(y);
  const x0 = Math.max(0, Math.round(left));
  const band = useBand ? wordBand(line, i, j) : null;
  const margin = band ? (band[1] - band[0]) * 0.08 : 0;
  const y0 = Math.max(0, Math.round(band ? band[0] - margin : Math.min(...ys) - a - padY));
  const x1 = Math.min(page.w, Math.round(right));
  const y1 = Math.min(page.h, Math.round(band ? band[1] + margin : Math.max(...ys) + d + padY));
  return { x: x0, y: y0, w: Math.max(8, x1 - x0), h: Math.max(8, y1 - y0), a, d };
}

function iiifRegion(page, rect, outWidth, outHeight) {
  const size = outHeight ? `,${outHeight}` : `${outWidth},`;
  return `${corpus.base}${encodeURI(page.iiif)}/${rect.x},${rect.y},${rect.w},${rect.h}/${size}/0/default.jpg`;
}

function ratio() {
  return Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
}

function boxOf(height) {
  return { height: Math.round(height * (ABOVE + BELOW)), base: Math.round(height * ABOVE) };
}

function inkPart(line, page, i, j, height, letters) {
  const reach = (line.a ?? 60) + (line.d ?? 40);
  const scale = height / reach;
  const box = boxOf(height);
  const x0 = Math.max(0, Math.round(line.x[i] - reach * (letters ? LETTER_PAD : WORD_LEFT)));
  const x1 = Math.min(page.w, Math.round(line.x[j] + reach * (letters ? LETTER_PAD : WORD_RIGHT)));
  const base = baselineAt(line.b, (line.x[i] + line.x[j]) / 2);
  const y0 = Math.round(Math.max(0, base - box.base / scale));
  const y1 = Math.round(Math.min(page.h, base + (box.height - box.base) / scale));
  const rect = { x: x0, y: y0, w: Math.max(4, x1 - x0), h: Math.max(4, y1 - y0) };
  const shape = { rect, line, i, j, letters };
  return { page, rect, shape, width: rect.w * scale, height: rect.h * scale, top: box.base - (base - y0) * scale };
}

function percentile(hist, total, fraction) {
  let left = total * fraction;
  for (let v = 0; v < 256; v++) {
    left -= hist[v];
    if (left <= 0) return v;
  }
  return 255;
}

function inkAlpha(data, width, height, soft) {
  const count = width * height;
  const lum = new Uint8Array(count);
  const hist = new Uint32Array(256);
  for (let k = 0; k < count; k++) {
    const p = k * 4;
    lum[k] = (data[p] * 77 + data[p + 1] * 151 + data[p + 2] * 28) >> 8;
    hist[lum[k]]++;
  }
  const paper = percentile(hist, count, 0.8);
  const dark = percentile(hist, count, 0.015);
  const span = Math.max(48, paper - dark);
  const light = paper - span * 0.2;
  const full = paper - span * 0.78;
  const featherX = soft ? Math.max(2, width * 0.05) : 1.5;
  const featherY = soft ? Math.max(2, height * 0.07) : 1.5;
  for (let y = 0; y < height; y++) {
    const edgeY = Math.min(1, (y + 0.5) / featherY, (height - y - 0.5) / featherY);
    for (let x = 0; x < width; x++) {
      const k = y * width + x;
      const edge = Math.min(edgeY, (x + 0.5) / featherX, (width - x - 0.5) / featherX);
      const alpha = clamp((light - lum[k]) / (light - full), 0, 1);
      const p = k * 4;
      data[p] = 0;
      data[p + 1] = 0;
      data[p + 2] = 0;
      data[p + 3] = Math.round(255 * alpha * edge);
    }
  }
}

function shapeInk(data, width, height, shape) {
  const { rect, line, i, j, letters } = shape;
  const a = line.a ?? 60;
  const d = line.d ?? 40;
  const reach = a + d;
  const sx = rect.w / width;
  const sy = rect.h / height;
  const count = width * height;
  const speck = (height * 0.016) ** 2;
  const baseAt = (x) => (baselineAt(line.b, rect.x + (x + 0.5) * sx) - rect.y) / sy;
  const coreTop = new Float32Array(width);
  const coreBottom = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const base = baseAt(x);
    coreTop[x] = base - (0.4 * a) / sy;
    coreBottom[x] = base - (0.06 * a) / sy;
  }
  const left = (line.x[i] - rect.x) / sx;
  const right = (line.x[j] - rect.x) / sx;
  const sharp = (LETTER_SHARP * reach) / sx;
  const soft = (LETTER_SOFT * reach) / sx;
  const near = (x) => {
    const off = Math.max(left - x, x - right, 0) - sharp;
    return off <= 0 ? 1 : Math.max(FAINT, 1 - ((1 - FAINT) * off) / (soft - sharp));
  };
  const outside = (x) => (letters ? near(x) : x >= left && x <= right ? 1 : FAINT);
  const label = new Int32Array(count);
  const stack = new Int32Array(count);
  const weights = [0];
  for (let start = 0; start < count; start++) {
    if (label[start] || data[start * 4 + 3] < INK_CUT) continue;
    const id = weights.length;
    label[start] = id;
    stack[0] = start;
    let top = 1;
    let mass = 0;
    let inside = 0;
    let sumX = 0;
    let sumY = 0;
    let edge = false;
    let core = false;
    while (top) {
      const k = stack[--top];
      const y = (k / width) | 0;
      const x = k - y * width;
      mass++;
      sumX += x;
      sumY += y;
      if (x >= left && x <= right) inside++;
      if (y === 0 || y === height - 1) edge = true;
      if (y >= coreTop[x] && y <= coreBottom[x]) core = true;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
          const q = yy * width + xx;
          if (!label[q] && data[q * 4 + 3] >= INK_CUT) {
            label[q] = id;
            stack[top++] = q;
          }
        }
      }
    }
    const up = baseAt(sumX / mass) - sumY / mass;
    const stray = edge || mass < speck || up * sy > a || -up * sy > 1.1 * d;
    if (stray && !core) weights.push(0);
    else if (inside >= mass * (letters ? 0.6 : 0.5)) weights.push(1);
    else weights.push(null);
  }
  for (let k = 0; k < count; k++) {
    const p = k * 4 + 3;
    if (!data[p]) continue;
    const y = (k / width) | 0;
    const x = k - y * width;
    let weight = -1;
    if (label[k]) weight = weights[label[k]] ?? outside(x);
    else {
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
          const id = label[yy * width + xx];
          if (id) weight = Math.max(weight, weights[id] ?? outside(x));
        }
      }
      if (weight < 0) weight = 0;
    }
    if (weight < 1) data[p] = Math.round(data[p] * weight);
  }
}

function loadImage(url, cors) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

const sameOrigin = (url) => url.startsWith("blob:") || url.startsWith("data:");

async function maskFrom(img, region, width, height, shape = null) {
  const [sx, sy, sw, sh] = region ?? [0, 0, img.naturalWidth, img.naturalHeight];
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width ?? sw));
  canvas.height = Math.max(1, Math.round(height ?? sh));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  inkAlpha(pixels.data, canvas.width, canvas.height, !shape);
  if (shape) shapeInk(pixels.data, canvas.width, canvas.height, shape);
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve));
  if (!blob) throw new Error("mask");
  return URL.createObjectURL(blob);
}

function setMask(node, url) {
  node.style.webkitMaskImage = `url("${url}")`;
  node.style.maskImage = `url("${url}")`;
  node.classList.add("ready");
}

function plainInk(node, url, region) {
  return loadImage(url, false).then(
    (img) => {
      const [sx, sy, sw] = region ?? [0, 0, img.naturalWidth];
      const scale = parseFloat(node.style.width) / sw;
      img.style.width = `${img.naturalWidth * scale}px`;
      img.style.left = `${-sx * scale}px`;
      img.style.top = `${-sy * scale}px`;
      img.alt = "";
      node.replaceChildren(img);
      node.classList.add("plain", "ready");
      return true;
    },
    () => false,
  );
}

async function paintInk(node, url, region = null) {
  let img;
  try {
    img = await loadImage(url, !sameOrigin(url));
  } catch (error) {
    return plainInk(node, url, region);
  }
  try {
    const scale = region ? Math.min(1, 240 / region[3]) : 1;
    const mask = await maskFrom(img, region, region && region[2] * scale, region && region[3] * scale, node.shape);
    node.mask = mask;
    setMask(node, mask);
    return true;
  } catch (error) {
    return plainInk(node, url, region);
  }
}

const loader = { queue: [], active: 0 };

const visibility = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const node = entry.target;
      node.visible = entry.isIntersecting;
      if (node.visible && !node.state) {
        node.state = "queued";
        loader.queue.push(node);
      }
    }
    pump();
  },
  { rootMargin: "500px 0px" },
);

function pump() {
  while (loader.active < IMAGE_LIMIT && loader.queue.length) {
    const node = loader.queue.shift();
    if (!node.isConnected || !node.visible) {
      node.state = null;
      continue;
    }
    node.state = "loading";
    loader.active++;
    paintInk(node, node.dataset.src).then((ok) => {
      loader.active--;
      node.state = ok || node.retried ? "done" : null;
      if (!ok && node.retried) node.classList.add("failed");
      if (!ok && !node.retried) {
        node.retried = true;
        setTimeout(() => {
          if (!node.state && node.visible) {
            node.state = "queued";
            loader.queue.push(node);
            pump();
          }
        }, 1200);
      }
      pump();
    });
  }
}

function forget(node) {
  for (const ink of node.querySelectorAll(".ink")) {
    visibility.unobserve(ink);
    if (ink.mask) URL.revokeObjectURL(ink.mask);
  }
}

const measurer = document.createElement("canvas").getContext("2d");
function textWidth(text, size) {
  measurer.font = `${size}px "EB Garamond"`;
  return measurer.measureText(text).width;
}

function termLabel(term) {
  return term.letters ? `„${term.inner}“` : term.inner;
}

function describe(inst) {
  const folio = inst.page.folio ? `, ${TEXT.folio} ${inst.page.folio}` : "";
  const date = inst.source.kind === "journal" && inst.source.date ? inst.source.date : inst.year;
  return `${inst.source.title}${folio}, ${date}${isStruck(inst) ? `, ${TEXT.struck}` : ""}`;
}

function containingWord(text, i, j) {
  let from = i;
  let to = j;
  while (from > 0 && isWordChar(text[from - 1])) from--;
  while (to < text.length && isWordChar(text[to])) to++;
  return [text.slice(from, i), text.slice(i, j), text.slice(j, to)];
}

function tileFor(block, m, height, available) {
  const cached = block.tiles.get(m);
  if (cached && cached.width <= available && (!cached.fitted || cached.fitted === available)) return cached;
  if (cached && cached.node) forget(cached.node);
  const tile = makeTile(block.view, m, height, available);
  block.tiles.set(m, tile);
  return tile;
}

function fitInk(inst, height, available, letters) {
  let parts = null;
  let inkWidth = 0;
  let fitted = 0;
  for (let size = height; ; ) {
    parts = [inkPart(inst.line, inst.page, inst.i, inst.j, size, letters)];
    if (inst.join) parts.push(inkPart(inst.join.line, inst.page, inst.join.ni, inst.join.nj, size, false));
    inkWidth = parts.reduce((sum, part) => sum + part.width, 0) + JOIN_GAP * (parts.length - 1);
    if (inkWidth <= available || size < 14) break;
    size = (size * available) / inkWidth - 0.5;
    height = size;
    fitted = available;
  }
  return { parts, inkWidth, height, fitted };
}

function makeTile(view, m, height, available) {
  const inst = instance(view.result, m);
  const letters = view.term.letters;
  const tile = { m, inst, ...fitInk(inst, height, available, letters), node: null, captionWidth: 0, word: null };
  if (letters) {
    tile.word = containingWord(inst.line.t, inst.i, inst.j);
    tile.captionWidth = textWidth(tile.word.join(""), sizes.caption) + 2;
  }
  tile.width = Math.max(tile.inkWidth, tile.captionWidth);
  return tile;
}

function spokenText(inst) {
  const own = inst.line.t.slice(inst.i, inst.j);
  return inst.join ? own + inst.join.line.t.slice(inst.join.ni, inst.join.nj) : own;
}

function inkFrame(tile) {
  const box = boxOf(tile.height);
  const frame = el("span", "box");
  frame.style.height = `${box.height}px`;
  const inks = el("span", "inks");
  inks.style.width = `${tile.inkWidth}px`;
  let left = 0;
  tile.parts.forEach((part, k) => {
    if (k) {
      const mark = el("span", "joint");
      mark.style.left = `${left + JOIN_GAP / 2}px`;
      mark.style.top = `${box.base - tile.height * 0.45}px`;
      mark.style.height = `${tile.height * 0.55}px`;
      inks.append(mark);
      left += JOIN_GAP;
    }
    const ink = el("span", "ink");
    ink.style.left = `${left}px`;
    ink.style.top = `${part.top}px`;
    ink.style.width = `${part.width}px`;
    ink.style.height = `${part.height}px`;
    ink.dataset.src = iiifRegion(part.page, part.rect, 0, Math.round(part.height * ratio()));
    ink.shape = part.shape;
    inks.append(ink);
    left += part.width;
  });
  frame.append(inks);
  tile.inks = inks;
  tile.frame = frame;
  return frame;
}

function tileNode(view, tile) {
  if (tile.node) return tile.node;
  const { inst } = tile;
  const node = el("button", isStruck(inst) ? "tile struck" : "tile");
  node.type = "button";
  node.title = describe(inst);
  node.setAttribute("aria-label", `${tile.word ? tile.word.join("") : spokenText(inst)}, ${describe(inst)}`);
  const frame = inkFrame(tile);
  for (const ink of frame.querySelectorAll(".ink")) visibility.observe(ink);
  tile.caption = el("span", "cap");
  tile.caption.lang = "de";
  tile.caption.translate = false;
  tile.caption.setAttribute("aria-hidden", "true");
  if (tile.word) {
    const [before, hit, after] = tile.word;
    tile.caption.append(before, el("span", "hit", hit), after);
  }
  node.append(frame, tile.caption);
  node.addEventListener("click", () => openDetail(view, tile.m, node));
  tile.node = node;
  return node;
}

function placeTile(view, tile, centred, rowBase) {
  const node = tileNode(view, tile);
  node.style.width = `${tile.width}px`;
  tile.frame.style.width = `${tile.width}px`;
  tile.frame.style.marginTop = `${rowBase - boxOf(tile.height).base}px`;
  tile.inks.style.left = `${centred ? (tile.width - tile.inkWidth) / 2 : 0}px`;
  return node;
}

function pinSize(box, available) {
  const [, , w, h] = pin.region;
  const width = Math.min((w / h) * box.height, available * 0.45);
  return { width, height: (width * h) / w };
}

function pinInk(width, height) {
  const ink = el("span", "ink");
  ink.style.width = `${width}px`;
  ink.style.height = `${height}px`;
  if (pin.mask) setMask(ink, pin.mask);
  else {
    const scale = width / pin.region[2];
    const img = new Image();
    img.alt = "";
    img.src = pin.src;
    img.style.width = `${pin.natural[0] * scale}px`;
    img.style.left = `${-pin.region[0] * scale}px`;
    img.style.top = `${-pin.region[1] * scale}px`;
    ink.append(img);
    ink.classList.add("plain", "ready");
  }
  return ink;
}

function pinTile(box, size, height) {
  const node = el("div", "tile pin");
  node.title = TEXT.pinned;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", TEXT.pinned);
  const frame = el("span", "box");
  frame.style.height = `${box.height}px`;
  frame.style.width = `${size.width}px`;
  const ink = pinInk(size.width, size.height);
  ink.style.top = `${(box.height - size.height) / 2}px`;
  const stroke = el("span", "stroke");
  stroke.style.top = `${box.base - height * 0.62}px`;
  stroke.style.height = `${height * 0.86}px`;
  frame.append(ink);
  node.append(frame, stroke, el("span", "cap"));
  node.style.width = `${size.width + PIN_RULE}px`;
  return node;
}

function breakLines(count, widthOf, available, gap, maxLines, lead) {
  const lines = [];
  let items = [];
  let used = lead;
  let k = 0;
  while (k < count) {
    const width = Math.min(widthOf(k), available);
    const next = used ? used + gap + width : width;
    if (next > available && used) {
      lines.push({ items, used, lead: lines.length === 0 && lead > 0 });
      if (lines.length === maxLines) return { lines, count: k };
      items = [];
      used = 0;
      continue;
    }
    items.push(k);
    used = next;
    k++;
  }
  if (items.length || (lead && !lines.length)) lines.push({ items, used, lead: lines.length === 0 && lead > 0, last: true });
  return { lines, count: k };
}

function chronologicalOrder(view, items) {
  const { lineOf } = view.result;
  const keys = items.map((m, rank) => ({ m, rank, year: corpus.lineYear[lineOf[m]], group: corpus.groupRank[corpus.lineGroup[lineOf[m]]] }));
  keys.sort((a, b) => a.year - b.year || a.group - b.group || a.rank - b.rank);
  return keys.map((key) => key.m);
}

function arrange(block) {
  const available = Math.floor(block.flow.clientWidth);
  if (!available) return;
  const { view } = block;
  const letters = view.term.letters;
  const height = block.band ? sizes.band : letters ? sizes.letters : sizes.ink;
  const box = boxOf(height);
  const gap = sizes.gap;
  const pinned = pin ? pinSize(box, available) : null;
  const lead = pinned ? pinned.width + PIN_RULE : 0;
  const items = block.items ?? view.result.order;
  const tileAt = (m) => tileFor(block, m, height, available);
  let display = items;
  if (block.band) {
    const first = breakLines(items.length, (k) => tileAt(items[k]).width, available, gap, block.lines, lead);
    display = chronologicalOrder(view, Array.from(items.subarray ? items.subarray(0, first.count) : items.slice(0, first.count)));
  }
  const layout = breakLines(display.length, (k) => tileAt(display[k]).width, available, gap, block.lines, lead);
  block.display = Array.from(display.slice(0, layout.count));
  block.section.style.setProperty("--base", `${box.base}px`);
  block.section.style.setProperty("--box", `${box.height}px`);
  let previousYear = 0;
  const rows = layout.lines.map((line) => {
    const row = el("div", "line");
    const nodes = line.items.map((k, n) => {
      const tile = tileAt(display[k]);
      const node = placeTile(view, tile, letters, box.base);
      if (block.band && !letters) {
        const year = tile.inst.year;
        tile.caption.textContent = n === 0 || year !== previousYear ? String(year) : "";
        previousYear = year;
      }
      return node;
    });
    if (line.lead) nodes.unshift(pinTile(box, pinned, height));
    let spacing = gap;
    if (!line.last && nodes.length > 1) {
      const even = gap + (available - line.used) / (nodes.length - 1);
      if (even <= gap * 2.6) spacing = even;
    }
    row.style.columnGap = `${spacing}px`;
    row.append(...nodes);
    return row;
  });
  block.lineBox.replaceChildren(...rows);
  const rest = items.length - layout.count;
  block.more.hidden = rest <= 0;
  block.more.textContent = TEXT.more(formatNumber(rest));
  view.sequence = null;
}

function arrangeAll() {
  for (const view of views) for (const block of view.blocks) arrange(block);
}

function makeBlock(view, options) {
  const block = { view, tiles: new Map(), display: [], ...options };
  block.section = el("section", `block ${options.band ? "band" : "group"}${view.term.letters ? " letters" : ""}`);
  const label = el("div", "label");
  if (options.title) label.title = options.title;
  block.flow = el("div", "flow");
  block.lineBox = el("div", "lines");
  block.more = el("button", "word more");
  block.more.type = "button";
  block.more.addEventListener("click", () => {
    block.lines += block.step;
    arrange(block);
  });
  label.append(...options.label, block.more);
  block.flow.append(block.lineBox);
  block.section.append(label, block.flow);
  return block;
}

function german(node) {
  node.lang = "de";
  node.translate = false;
  return node;
}

function termHead(view) {
  const head = el("h2", "head");
  head.append(german(el("span", "term", termLabel(view.term))));
  return [head, el("span", "count", formatNumber(view.result.order.length))];
}

function yearSpan() {
  return yearRange[0] === yearRange[1] ? String(yearRange[0]) : `${yearRange[0]}–${yearRange[1]}`;
}

function emptyNote(view) {
  const note = el("div", "empty");
  const outside = Array.from(view.result.perYear.values()).some(Boolean);
  view.said = outside ? TEXT.noneInYears(yearSpan()) : view.term.letters ? TEXT.noLetters(termLabel(view.term)) : TEXT.noHit;
  const message = el("p", "", view.said);
  if (outside) {
    const all = el("button", "word", TEXT.allYears);
    all.type = "button";
    all.addEventListener("click", () => setRange(yearFull[0], yearFull[1]));
    message.append(all);
  }
  note.append(message);
  if (!outside && !view.term.letters && !view.term.folded.includes(" ")) {
    const alts = nearWords(view.term.folded);
    if (alts.length) {
      const list = german(el("p", "alts"));
      for (const alt of alts) {
        const button = el("button", "", alt.shown);
        button.type = "button";
        button.append(el("span", "n", formatNumber(alt.n)));
        button.addEventListener("click", () => replaceTerm(view.term.raw, alt.shown));
        list.append(button);
      }
      note.append(list);
    }
  }
  return note;
}

function emptyRow(view, head) {
  const section = el("section", "block band void");
  const label = el("div", "label");
  label.append(...head);
  section.append(label, emptyNote(view));
  return section;
}

function groupView(view, main) {
  const { result } = view;
  const byGroup = new Map();
  for (const m of result.order) {
    const g = corpus.lineGroup[result.lineOf[m]];
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(m);
  }
  if (!byGroup.size) {
    main.append(emptyRow(view, termHead(view)));
    return;
  }
  const sources = new Set(Array.from(result.order, (m) => corpus.pages[corpus.lines[result.lineOf[m]].p].s));
  const summary = el("section", "summary");
  view.said = TEXT.summary(formatNumber(result.order.length), sources.size);
  summary.append(german(el("h2", "term", termLabel(view.term))), el("p", "count", view.said));
  main.append(summary);
  const keys = Array.from(byGroup.keys()).sort((a, b) => corpus.groupRank[a] - corpus.groupRank[b]);
  const lines = clamp(Math.floor(8 / keys.length), 1, 6);
  for (const g of keys) {
    const group = corpus.groups[g];
    const head = el("h3", "head");
    head.append(el("span", "date", group.date), el("span", "name", group.name));
    const label = [head];
    const block = makeBlock(view, { items: byGroup.get(g), lines, step: 3, label, title: group.title });
    view.blocks.push(block);
    main.append(block.section);
  }
}

function bandView(view, main) {
  if (!view.result.order.length) {
    main.append(emptyRow(view, termHead(view)));
    return;
  }
  const lines = sizes === SIZES.narrow ? 3 : 2;
  const block = makeBlock(view, { items: null, lines, step: 2, band: true, label: termHead(view) });
  view.blocks.push(block);
  main.append(block.section);
}

function dropViews() {
  for (const view of views) for (const block of view.blocks) for (const tile of block.tiles.values()) if (tile.node) forget(tile.node);
  loader.queue.length = 0;
}

function renderViews(terms) {
  dropViews();
  views = terms.map((term) => ({ term, result: findInstances(term), blocks: [] }));
  const main = $("#results");
  main.replaceChildren();
  document.body.classList.toggle("idle", !terms.length);
  paintTimeline();
  if (!terms.length) return;
  main.classList.toggle("compare", views.length > 1);
  if (views.length === 1) groupView(views[0], main);
  else for (const view of views) bandView(view, main);
  arrangeAll();
  announce(views.map((view) => `${termLabel(view.term)}: ${view.said ?? formatNumber(view.result.order.length)}`).join("; "));
}

let announced = "";
function announce(text) {
  if (text === announced) return;
  announced = text;
  $("#announce").textContent = text;
}

function replaceTerm(raw, replacement) {
  const field = $("#q");
  const pieces = field.value.split("|").map((p) => (p.trim() === raw ? ` ${replacement}` : p));
  field.value = pieces.join("|").trim();
  runSearch();
}

let searchTimer = 0;
function scheduleSearch(delay = 140) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, delay);
}

function runSearch() {
  if (!corpus) return;
  const id = ++runId;
  const text = $("#q").value;
  const terms = parseQuery(text);
  renderViews(terms);
  if (id !== runId) return;
  syncSwitch(terms);
  writeHash(text);
}

function syncSwitch(terms) {
  if (terms.length) mode = terms[0].letters ? "letters" : "word";
  for (const button of document.querySelectorAll(".switch button")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  const toggle = $("#case");
  toggle.hidden = mode !== "letters";
  toggle.setAttribute("aria-pressed", String(matchCase));
}

function setMode(next) {
  const field = $("#q");
  mode = next;
  const pieces = field.value.split("|").map((p) => p.trim()).filter(Boolean);
  if (!pieces.length) {
    field.value = next === "letters" ? "\"\"" : "";
    field.focus();
    field.setSelectionRange(1, 1);
    syncSwitch([]);
    return;
  }
  const bare = pieces.map((p) => (OPEN_QUOTES.includes(p[0]) ? p.slice(1).replace(new RegExp(`[${OPEN_QUOTES}]+$`), "") : p));
  field.value = bare.map((p) => (next === "letters" ? `"${p}"` : p)).join("|");
  runSearch();
}

function writeHash(text = $("#q").value) {
  const query = text.trim() ? `&q=${encodeURIComponent(text.trim()).replace(/%7C/gi, "|")}` : "";
  const years = yearRange[0] === yearFull[0] && yearRange[1] === yearFull[1] ? "" : `&y=${yearRange[0]}-${yearRange[1]}`;
  const cased = query && matchCase && mode === "letters" ? "&case=1" : "";
  const open = detail && detail.view === views[0] ? `&d=${detail.index}` : "";
  const parts = `${query}${cased}${years}${pinHash}${open}`;
  const encoded = parts ? `#${parts.slice(1)}` : "";
  const target = encoded || location.pathname + location.search;
  try {
    history.replaceState(null, "", target);
  } catch (error) {
    if (encoded) location.hash = encoded;
  }
}

function readHash() {
  const match = location.hash.match(/[#&]q=([^&]*)/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return match[1];
  }
}

const readCase = () => /[#&]case=1(&|$)/.test(location.hash);

const suggest = { items: [], index: -1, start: 0, end: 0 };

function segmentAt(text, caret) {
  let start = 0;
  for (;;) {
    const bar = text.indexOf("|", start);
    if (bar === -1 || bar >= caret) return { start, end: bar === -1 ? text.length : bar };
    start = bar + 1;
  }
}

function updateSuggest() {
  const field = $("#q");
  const { start, end } = segmentAt(field.value, field.selectionStart ?? field.value.length);
  const segment = field.value.slice(start, end).trim();
  const list = $("#suggest");
  if (!segment || OPEN_QUOTES.includes(segment[0]) || !corpus) return hideSuggest();
  const items = completions(foldString(segment).replace(/\s+/g, " "));
  if (!items.length) return hideSuggest();
  suggest.items = items;
  suggest.index = -1;
  suggest.start = start;
  suggest.end = end;
  list.replaceChildren();
  items.forEach((item, k) => {
    const row = el("li");
    row.id = `suggest-${k}`;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");
    row.append(el("span", "", item.shown), el("span", "n", formatNumber(item.n)));
    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      acceptSuggest(k);
    });
    list.append(row);
  });
  const size = parseFloat(getComputedStyle(field).fontSize);
  list.style.left = `${Math.min(textWidth(field.value.slice(0, start), size), Math.max(0, field.clientWidth - 300))}px`;
  list.hidden = false;
  field.setAttribute("aria-expanded", "true");
  field.removeAttribute("aria-activedescendant");
}

function hideSuggest() {
  $("#suggest").hidden = true;
  $("#q").setAttribute("aria-expanded", "false");
  $("#q").removeAttribute("aria-activedescendant");
  suggest.items = [];
  suggest.index = -1;
}

function moveSuggest(step) {
  const rows = $("#suggest").children;
  if (!rows.length) return;
  suggest.index = (suggest.index + step + rows.length) % rows.length;
  Array.from(rows).forEach((row, k) => row.setAttribute("aria-selected", String(k === suggest.index)));
  rows[suggest.index].scrollIntoView({ block: "nearest" });
  $("#q").setAttribute("aria-activedescendant", rows[suggest.index].id);
}

function acceptSuggest(k) {
  const item = suggest.items[k];
  if (!item) return;
  const field = $("#q");
  const text = field.value;
  const lead = text.slice(suggest.start, suggest.end).match(/^\s*/)[0];
  field.value = text.slice(0, suggest.start) + lead + item.shown + text.slice(suggest.end);
  const caret = suggest.start + lead.length + item.shown.length;
  field.setSelectionRange(caret, caret);
  hideSuggest();
  runSearch();
}

function setupSearch() {
  const field = $("#q");
  field.addEventListener("input", () => {
    updateSuggest();
    scheduleSearch();
  });
  field.addEventListener("click", updateSuggest);
  field.addEventListener("blur", () => setTimeout(hideSuggest, 120));
  field.addEventListener("keydown", (e) => {
    const open = !$("#suggest").hidden;
    if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      moveSuggest(1);
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      moveSuggest(-1);
    } else if ((e.key === "Enter" || e.key === "Tab") && open && suggest.index >= 0) {
      e.preventDefault();
      acceptSuggest(suggest.index);
    } else if (e.key === "Enter") {
      hideSuggest();
      runSearch();
    } else if (e.key === "Escape") {
      if (open) hideSuggest();
      else field.blur();
    }
  });
  for (const button of document.querySelectorAll(".switch button")) {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  }
  $("#case").addEventListener("click", () => {
    matchCase = !matchCase;
    runSearch();
  });
  window.addEventListener("hashchange", () => {
    const wanted = readHash();
    const cased = readCase();
    const pinned = location.hash.match(/[#&](pin=[^&]*(&box=[^&]*)?)/);
    if ((pinned ? `&${pinned[1]}` : "") !== pinHash) {
      if (pinned) pinFromHash();
      else removePin();
    }
    if (wanted !== $("#q").value.trim() || cased !== matchCase) {
      closeDetail(false);
      $("#q").value = wanted;
      matchCase = cased;
      runSearch();
    }
  });
}

const timeline = { min: 0, max: 0, span: 1, slots: [], counts: [], hits: [] };

function setupTimeline() {
  const years = corpus.sources.map((s) => s.year).filter((y) => y > 0);
  const min = Math.min(...years);
  const max = Math.max(...years);
  const span = max - min + 1;
  Object.assign(timeline, { min, max, span });
  yearRange = [min, max];
  yearFull = [min, max];
  const wanted = location.hash.match(/[#&]y=(\d+)-(\d+)/);
  if (wanted) yearRange = [clamp(Number(wanted[1]), min, max), clamp(Number(wanted[2]), min, max)];
  if (yearRange[0] > yearRange[1]) yearRange = [min, max];
  const counts = new Array(span).fill(0);
  for (const year of corpus.lineYear) if (year >= min && year <= max) counts[year - min]++;
  timeline.counts = counts;
  const peak = Math.max(...counts);
  const root = $("#timeline");
  const at = (offset) => `${(offset / span) * 100}%`;
  timeline.slots = counts.map((count, k) => {
    const slot = el("i");
    slot.style.left = at(k + 0.5);
    const base = el("b", "base");
    base.style.transform = `scaleY(${count ? barHeight(count, peak) / 100 : 0})`;
    const hit = el("b", "hit");
    hit.style.transform = "scaleY(0)";
    slot.append(base, hit);
    $(".bars", root).append(slot);
    return { slot, hit };
  });
  for (let year = Math.ceil((min + 4) / 10) * 10; year <= max - 4; year += 10) {
    const tick = el("span", (year / 10) % 2 ? "odd" : "", String(year));
    tick.style.left = at(year - min + 0.5);
    $(".ticks", root).append(tick);
  }
  const journals = corpus.sources.filter((s) => s.kind === "journal").length;
  $("#corpus").textContent = TEXT.corpus(
    formatNumber(corpus.lines.length),
    formatNumber(corpus.words),
    formatNumber(journals),
    formatNumber(corpus.sources.length - journals),
  );
  setupTimelineInput(root);
  placeNames();
}

function placeNames() {
  const { min, span } = timeline;
  const eras = new Map();
  const add = (name, first, last, lines) => {
    const era = eras.get(name) ?? { first, last, lines: 0 };
    eras.set(name, { first: Math.min(era.first, first), last: Math.max(era.last, last), lines: era.lines + lines });
  };
  const linesOf = new Map(corpus.groups.flatMap((group) => group.sources.map((source) => [source, group.lines / group.sources.length])));
  for (const source of corpus.sources) if (ERAS[source.id]) add(ERAS[source.id], source.year, source.year, linesOf.get(source));
  const lastEra = Math.max(0, ...Array.from(eras.values(), (era) => era.last));
  for (const source of corpus.sources) {
    if (source.kind !== "journal" && source.year > lastEra) add(TEXT.letterGroup, source.year, source.year, linesOf.get(source));
  }
  const box = $("#timeline .names");
  const labels = Array.from(eras, ([name, era]) => {
    const centre = ((era.first + era.last + 1) / 2 - min) / span;
    const edge = centre < 0.04 ? "start" : centre > 0.96 ? "end" : "";
    const label = el("span", edge, name);
    if (!edge) label.style.left = `${centre * 100}%`;
    return { label, lines: era.lines };
  });
  box.replaceChildren(...labels.map((item) => item.label));
  const measured = labels.map((item) => ({ ...item, rect: item.label.getBoundingClientRect() }));
  const kept = [];
  for (const item of measured.sort((a, b) => b.lines - a.lines)) {
    item.clash = kept.some((other) => item.rect.left < other.right + 14 && item.rect.right > other.left - 14);
    if (!item.clash) kept.push(item.rect);
  }
  for (const item of measured) item.label.hidden = item.clash;
}

function barHeight(count, peak) {
  return Math.max(6, (Math.log1p(count) / Math.log1p(peak)) * 100);
}

function paintTimeline() {
  const { min, span, slots } = timeline;
  if (!slots.length) return;
  const [from, to] = yearRange;
  const hits = new Array(span).fill(0);
  for (const view of views) for (const [year, n] of view.result.perYear) if (year >= min && year < min + span) hits[year - min] += n;
  const peak = Math.max(1, ...hits);
  slots.forEach(({ slot, hit }, k) => {
    const year = min + k;
    slot.classList.toggle("out", year < from || year > to);
    hit.style.transform = `scaleY(${hits[k] ? barHeight(hits[k], peak) / 100 : 0})`;
  });
  timeline.hits = hits;
  const root = $("#timeline");
  root.classList.toggle("query", views.length > 0);
  root.classList.toggle("narrow", from !== yearFull[0] || to !== yearFull[1]);
  const left = `${((from - min) / span) * 100}%`;
  const right = `${((to - min + 1) / span) * 100}%`;
  $(".h.lo", root).style.left = left;
  $(".h.hi", root).style.left = right;
  $(".end.lo", root).style.left = left;
  $(".end.hi", root).style.left = right;
  $(".end.lo", root).textContent = String(from);
  $(".end.hi", root).textContent = String(to);
  $(".run", root).style.left = left;
  $(".run", root).style.width = `${((to - from + 1) / span) * 100}%`;
  $(".h.lo", root).setAttribute("aria-valuenow", String(from));
  $(".h.hi", root).setAttribute("aria-valuenow", String(to));
  $("#allyears").hidden = from === yearFull[0] && to === yearFull[1];
}

function setRange(from, to) {
  if (from === yearRange[0] && to === yearRange[1]) return;
  yearRange = [from, to];
  paintTimeline();
  scheduleSearch(220);
}

function setupTimelineInput(root) {
  const { min, max, span } = timeline;
  const plot = $(".plot", root);
  const handles = [$(".h.lo", root), $(".h.hi", root)];
  const readout = $(".readout", root);
  for (const handle of handles) {
    handle.setAttribute("aria-valuemin", String(min));
    handle.setAttribute("aria-valuemax", String(max));
  }
  const yearAt = (clientX) => {
    const box = plot.getBoundingClientRect();
    return clamp(min + Math.floor(((clientX - box.left) / box.width) * span), min, max);
  };
  const moveEnd = (end, year) => {
    if (end === 0) setRange(Math.min(year, yearRange[1]), yearRange[1]);
    else setRange(yearRange[0], Math.max(year, yearRange[0]));
  };
  const show = (year) => {
    const k = year - min;
    const n = views.length ? timeline.hits[k] : timeline.counts[k];
    readout.replaceChildren(String(year), el("span", "", formatNumber(n)));
    readout.style.left = `${((k + 0.5) / span) * 100}%`;
    readout.classList.add("on");
  };
  let drag = null;
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const end = handles.indexOf(e.target);
    drag = { end, anchor: yearAt(e.clientX), x: e.clientX, moved: false };
    root.setPointerCapture(e.pointerId);
    if (end >= 0) handles[end].focus();
    e.preventDefault();
  });
  root.addEventListener("pointermove", (e) => {
    const year = yearAt(e.clientX);
    show(year);
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (drag.end >= 0) moveEnd(drag.end, year);
    else setRange(Math.min(drag.anchor, year), Math.max(drag.anchor, year));
  });
  root.addEventListener("pointerup", (e) => {
    if (drag && !drag.moved && drag.end < 0) {
      const year = yearAt(e.clientX);
      moveEnd(Math.abs(year - yearRange[0]) <= Math.abs(year - yearRange[1]) ? 0 : 1, year);
    }
    drag = null;
  });
  root.addEventListener("pointerleave", () => {
    if (!drag) readout.classList.remove("on");
  });
  root.addEventListener("dblclick", () => setRange(min, max));
  handles.forEach((handle, end) => {
    handle.addEventListener("focus", () => show(yearRange[end]));
    handle.addEventListener("blur", () => readout.classList.remove("on"));
    handle.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 10 : 1;
      let year = yearRange[end];
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") year -= step;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") year += step;
      else if (e.key === "Home") year = min;
      else if (e.key === "End") year = max;
      else return;
      e.preventDefault();
      moveEnd(end, clamp(year, min, max));
      show(yearRange[end]);
    });
  });
  $("#allyears").addEventListener("click", () => setRange(min, max));
}

function sequenceOf(view) {
  if (view.sequence) return view.sequence;
  const [first] = view.blocks;
  if (first && first.band) {
    const shown = new Set(first.display);
    view.sequence = [...first.display, ...Array.from(view.result.order).filter((m) => !shown.has(m))];
  } else view.sequence = view.blocks.flatMap((block) => block.items);
  return view.sequence;
}

function openDetail(view, m, origin = null) {
  view.sequence = null;
  const sequence = sequenceOf(view);
  showDetail(view, Math.max(0, sequence.indexOf(m)), origin);
}

function showDetail(view, index, origin = null) {
  closeViewer();
  const sequence = sequenceOf(view);
  const m = sequence[index];
  if (m === undefined) return;
  const root = $("#detail");
  const opening = !root.open;
  const kept = detail && !opening ? detail.origin : null;
  detail = { view, index, m, origin: origin ?? kept ?? document.activeElement };
  const inst = instance(view.result, m);
  const { line, page, i, j } = inst;
  $(".dbar .pos", root).textContent = TEXT.position(formatNumber(index + 1), formatNumber(sequence.length));
  $("#dterm").textContent = termLabel(view.term);
  setSteps(root, index, sequence.length);
  const body = $(".dbody", root);
  forget(body);
  const side = el("div", "dside");
  const display = el("div", "dview");
  body.replaceChildren(side, display);
  if (opening) {
    root.showModal();
    document.body.classList.add("locked");
  }
  side.append(specimenRow(view, inst, side.clientWidth - 12));
  side.append(editionLine(line, i, j));
  if (inst.join) side.append(editionLine(inst.join.line, inst.join.ni, inst.join.nj));
  side.append(sourceBlock(inst));
  const instRect = spanRect(line, page, i, j, 0, 0);
  const lineRect = spanRect(line, page, 0, line.t.length, 0, 0, false);
  detail.viewer = createViewer(display, page, lineRect, instRect);
  if (opening) $("#dterm").focus();
  writeHash();
}

function setSteps(root, index, count) {
  const prev = $(".dbar .prev", root);
  const next = $(".dbar .next", root);
  const focused = document.activeElement;
  prev.disabled = index === 0;
  next.disabled = index === count - 1;
  if (focused && focused.disabled) (prev.disabled ? (next.disabled ? $(".dbar .close", root) : next) : prev).focus();
}

function specimenRow(view, inst, available) {
  const row = el("div", "line specimens");
  const height = sizes.detail;
  const box = boxOf(height);
  row.style.setProperty("--base", `${box.base}px`);
  row.style.columnGap = `${sizes.gap}px`;
  let room = available;
  if (pin) {
    const size = pinSize(box, available);
    row.append(pinTile(box, size, height));
    room -= size.width + PIN_RULE + sizes.gap;
  }
  const tile = fitInk(inst, height, Math.max(40, room), view.term.letters);
  const frame = inkFrame(tile);
  frame.style.width = `${tile.inkWidth}px`;
  frame.style.marginTop = `${box.base - boxOf(tile.height).base}px`;
  const figure = el("div", isStruck(inst) ? "tile still struck" : "tile still");
  figure.setAttribute("role", "img");
  figure.setAttribute("aria-label", spokenText(inst));
  figure.append(frame);
  row.append(figure);
  for (const ink of frame.querySelectorAll(".ink")) {
    paintInk(ink, ink.dataset.src).then((ok) => ok || ink.classList.add("failed"));
  }
  return row;
}

function sourceBlock(inst) {
  const { source, page, line } = inst;
  const block = el("div", "source");
  block.append(german(el("p", "stitle", source.title)));
  const kind = source.kind === "journal" ? TEXT.journal : TEXT.letter;
  const date = source.kind === "journal" && source.date ? source.date : String(inst.year);
  block.append(el("p", "num", `${kind}, ${date}${isStruck(inst) ? `, ${TEXT.struck}` : ""}`));
  if (page.folio) block.append(el("p", "folio", `${TEXT.folio} ${page.folio}`));
  const link = el("a", "", TEXT.pageInEdition);
  link.href = page.url;
  link.target = "_blank";
  link.rel = "noopener";
  const links = el("p", "slinks");
  links.append(link);
  block.append(links);
  if (line.lq !== undefined) block.append(el("p", "sfit num", `${TEXT.lineFit} ${Math.round(line.lq * 100)} %`));
  return block;
}

function editionLine(line, i, j) {
  const wrap = german(el("p", "edition"));
  const flags = line.f || "";
  let run = null;
  let runKey = "";
  Array.from(line.t).forEach((ch, k) => {
    const flag = flags[k] === "s" ? "s" : flags[k] === "u" ? "u" : "";
    const inside = k >= i && k < j;
    const key = `${inside ? 1 : 0}${flag}`;
    if (key !== runKey) {
      run = el(inside ? "mark" : "span", flag);
      wrap.append(run);
      runKey = key;
    }
    run.textContent += ch;
  });
  return wrap;
}

function closeViewer() {
  if (detail && detail.viewer) detail.viewer.dispose();
}

function tileNodeFor(view, m) {
  for (const block of view.blocks) {
    const tile = block.tiles.get(m);
    if (tile && tile.node && tile.node.isConnected) return tile.node;
  }
  return null;
}

function closeDetail(returnFocus = true) {
  if (!detail) return;
  const { view, m, origin } = detail;
  closeViewer();
  detail = null;
  const root = $("#detail");
  forget($(".dbody", root));
  if (root.open) root.close();
  document.body.classList.remove("locked");
  writeHash();
  if (!returnFocus) return;
  const target = tileNodeFor(view, m) ?? origin;
  if (target && target.isConnected) target.focus();
}

function stepDetail(step) {
  if (!detail) return;
  const index = detail.index + step;
  if (index < 0 || index >= sequenceOf(detail.view).length) return;
  showDetail(detail.view, index);
}

function createViewer(display, page, lineRect, instRect) {
  const tools = el("div", "vbar");
  const host = el("div", "viewer");
  host.tabIndex = 0;
  host.setAttribute("role", "img");
  host.setAttribute("aria-label", TEXT.pageScan(page.folio));
  display.append(tools, host);
  const world = el("div", "world");
  const base = new Image();
  base.alt = "";
  base.decoding = "async";
  base.onerror = () => {
    host.setAttribute("aria-label", TEXT.imageFailed);
    host.append(el("p", "vfail", TEXT.imageFailed));
  };
  base.src = `${corpus.base}${encodeURI(page.iiif)}/full/1100,/0/default.jpg`;
  base.style.width = `${page.w}px`;
  base.style.height = `${page.h}px`;
  world.append(base);
  const lineBox = el("div", "vbox whole");
  const instBox = el("div", "vbox inst");
  for (const [box, r] of [[lineBox, lineRect], [instBox, instRect]]) {
    box.style.left = `${r.x}px`;
    box.style.top = `${r.y}px`;
    box.style.width = `${r.w}px`;
    box.style.height = `${r.h}px`;
  }
  const buttons = [
    [TEXT.zoomLine, TEXT.zoomLineLabel, "word", () => fitLine()],
    [TEXT.zoomPage, TEXT.zoomPageLabel, "word", () => fitPage()],
    ["−", TEXT.zoomOut, "icon", () => zoomBy(1 / 0.65)],
    ["+", TEXT.zoomIn, "icon", () => zoomBy(0.65)],
  ];
  for (const [label, name, kind, handler] of buttons) {
    const button = el("button", kind, label);
    button.type = "button";
    button.setAttribute("aria-label", name);
    button.addEventListener("click", handler);
    tools.append(button);
  }
  host.append(world);
  world.append(lineBox, instBox);

  const view = { cx: 0, cy: 0, vw: 1 };
  let detailImg = null;
  let timer = 0;
  let disposed = false;
  const size = () => ({ w: host.clientWidth || 800, h: host.clientHeight || 400 });

  function apply() {
    const { w, h } = size();
    const k = w / view.vw;
    world.style.transform = `translate(${w / 2 - view.cx * k}px, ${h / 2 - view.cy * k}px) scale(${k})`;
    const border = `${1.25 / k}px`;
    lineBox.style.borderWidth = border;
    instBox.style.borderWidth = border;
    clearTimeout(timer);
    timer = setTimeout(refine, 220);
  }

  function refine() {
    if (disposed) return;
    const { w, h } = size();
    const k = w / view.vw;
    if (k * ratio() * page.w <= 1150) return;
    const vh = (view.vw * h) / w;
    const x0 = Math.max(0, Math.floor(view.cx - view.vw * 0.7));
    const y0 = Math.max(0, Math.floor(view.cy - vh * 0.7));
    const x1 = Math.min(page.w, Math.ceil(view.cx + view.vw * 0.7));
    const y1 = Math.min(page.h, Math.ceil(view.cy + vh * 0.7));
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const outWidth = Math.min(rect.w, Math.round(rect.w * k * ratio()), 2600);
    const fresh = new Image();
    fresh.alt = "";
    fresh.onload = () => {
      if (disposed) return;
      if (detailImg) detailImg.remove();
      detailImg = fresh;
      world.insertBefore(fresh, lineBox);
    };
    fresh.src = iiifRegion(page, rect, outWidth, 0);
    fresh.style.left = `${rect.x}px`;
    fresh.style.top = `${rect.y}px`;
    fresh.style.width = `${rect.w}px`;
    fresh.style.height = `${rect.h}px`;
  }

  function zoomAt(factor, px, py) {
    const { w, h } = size();
    const k = w / view.vw;
    const wx = view.cx + (px - w / 2) / k;
    const wy = view.cy + (py - h / 2) / k;
    view.vw = Math.min(page.w * 1.3, Math.max(180, view.vw * factor));
    const k2 = w / view.vw;
    view.cx = wx - (px - w / 2) / k2;
    view.cy = wy - (py - h / 2) / k2;
    apply();
  }

  function zoomBy(factor) {
    const { w, h } = size();
    zoomAt(factor, w / 2, h / 2);
  }

  function fitLine() {
    view.cx = lineRect.x + lineRect.w / 2;
    view.cy = lineRect.y + lineRect.h / 2;
    view.vw = Math.max(lineRect.w * 1.15, 500);
    apply();
  }

  function fitPage() {
    const { w, h } = size();
    view.vw = Math.max(page.w, (page.h * w) / h) * 1.04;
    view.cx = page.w / 2;
    view.cy = page.h / 2;
    apply();
  }

  host.addEventListener("wheel", (e) => {
    const scroller = host.closest(".dbody");
    if (!e.ctrlKey && scroller && scroller.scrollHeight > scroller.clientHeight + 1) return;
    e.preventDefault();
    const box = host.getBoundingClientRect();
    zoomAt(Math.exp(e.deltaY * 0.0016), e.clientX - box.left, e.clientY - box.top);
  }, { passive: false });
  host.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = view.vw * 0.1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      view.cx += moves[e.key][0];
      view.cy += moves[e.key][1];
      apply();
    } else if (e.key === "+" || e.key === "=") zoomBy(0.65);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / 0.65);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  let drag = null;
  host.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    host.setPointerCapture(e.pointerId);
    host.classList.add("drag");
  });
  host.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const k = size().w / view.vw;
    view.cx -= (e.clientX - drag.x) / k;
    view.cy -= (e.clientY - drag.y) / k;
    drag = { x: e.clientX, y: e.clientY };
    apply();
  });
  const endDrag = () => {
    drag = null;
    host.classList.remove("drag");
  };
  host.addEventListener("pointerup", endDrag);
  host.addEventListener("pointercancel", endDrag);
  host.addEventListener("dblclick", (e) => {
    const box = host.getBoundingClientRect();
    zoomAt(0.5, e.clientX - box.left, e.clientY - box.top);
  });

  requestAnimationFrame(fitLine);
  return { dispose() { disposed = true; clearTimeout(timer); host.replaceChildren(); } };
}

let pinToken = 0;

async function setPin(src, region) {
  const token = ++pinToken;
  let img = null;
  for (const cors of sameOrigin(src) ? [false] : [true, false]) {
    try {
      img = await loadImage(src, cors);
      break;
    } catch (error) {
      img = null;
    }
  }
  if (token !== pinToken || !img) return;
  const area = region ?? [0, 0, img.naturalWidth, img.naturalHeight];
  const next = { src, region: area, natural: [img.naturalWidth, img.naturalHeight], mask: null };
  try {
    const scale = Math.min(1, 240 / area[3]);
    next.mask = await maskFrom(img, area, area[2] * scale, area[3] * scale);
  } catch (error) {
    next.mask = null;
  }
  if (token !== pinToken) return;
  dropPin();
  pin = next;
  $(".pinctl").hidden = false;
  const thumb = $(".pinctl .thumb");
  const [, , w, h] = area;
  thumb.replaceChildren(pinInk(Math.min(96, (w / h) * 26), Math.min(96, (w / h) * 26) * (h / w)));
  arrangeAll();
  if (detail) showDetail(detail.view, detail.index);
  writeHash();
}

function dropPin() {
  if (!pin) return;
  if (pin.mask) URL.revokeObjectURL(pin.mask);
  pin = null;
}

function removePin() {
  pinToken++;
  dropPin();
  pinHash = "";
  $(".pinctl").hidden = true;
  $(".pinctl .thumb").replaceChildren();
  arrangeAll();
  if (detail) showDetail(detail.view, detail.index);
  writeHash($("#q").value);
}

function pinFromHash() {
  const source = location.hash.match(/[#&]pin=([^&]*)/);
  if (!source) return;
  let url = source[1];
  try {
    url = new URL(decodeURIComponent(url), location.href).href;
  } catch (error) {
    return;
  }
  const rect = location.hash.match(/[#&]box=([\d.]+),([\d.]+),([\d.]+),([\d.]+)/);
  const region = rect ? rect.slice(1, 5).map(Number) : null;
  pinHash = `&pin=${source[1]}${rect ? `&box=${rect.slice(1, 5).join(",")}` : ""}`;
  setPin(url, region && region[2] > 0 && region[3] > 0 ? region : null);
}

function setupPinned() {
  $("#unpin").addEventListener("click", removePin);
}

function setupKeys() {
  document.addEventListener("keydown", (e) => {
    const typing = e.target.tagName === "INPUT";
    const modified = e.altKey || e.ctrlKey || e.metaKey;
    if (e.key === "/" && !typing && !modified) {
      e.preventDefault();
      closeDetail(false);
      $("#q").focus();
      $("#q").select();
    } else if (detail && !typing && !modified && e.key === "ArrowRight") stepDetail(1);
    else if (detail && !typing && !modified && e.key === "ArrowLeft") stepDetail(-1);
  });
  $("#detail").addEventListener("close", () => closeDetail());
  $(".dbar .close").addEventListener("click", () => closeDetail());
  $(".dbar .prev").addEventListener("click", () => stepDetail(-1));
  $(".dbar .next").addEventListener("click", () => stepDetail(1));
}

function setupHeader() {
  const header = $("header");
  const measure = () => {
    const sticky = getComputedStyle(header).position === "sticky";
    document.documentElement.style.setProperty("--head", `${sticky ? header.offsetHeight + 12 : 0}px`);
  };
  new ResizeObserver(measure).observe(header);
}

function setupResize() {
  let timer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = currentSizes();
      if (next !== sizes) {
        dropViews();
        sizes = next;
        for (const view of views) for (const block of view.blocks) block.tiles.clear();
      }
      arrangeAll();
      placeNames();
    }, 120);
  });
}

function applyText() {
  document.documentElement.lang = "en";
  document.title = TEXT.title;
  for (const node of document.querySelectorAll("[data-t]")) node.textContent = TEXT[node.dataset.t];
  for (const node of document.querySelectorAll("[data-label]")) node.setAttribute("aria-label", TEXT[node.dataset.label]);
  $("#q").placeholder = TEXT.placeholder;
}

async function start() {
  applyText();
  setupPinned();
  setupKeys();
  setupHeader();
  const status = $("#status");
  status.textContent = TEXT.loadingIndex;
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    const data = await loadData();
    status.textContent = TEXT.buildingIndex;
    await new Promise((resolve) => setTimeout(resolve, 30));
    corpus = buildCorpus(data);
    await document.fonts.load(`${sizes.caption}px "EB Garamond"`).catch(() => null);
  } catch (error) {
    status.textContent = TEXT.indexFailed(error.message);
    return;
  }
  status.remove();
  setupTimeline();
  setupSearch();
  setupResize();
  $("#q").disabled = false;
  const open = location.hash.match(/[#&]d=(\d+)/);
  pinFromHash();
  matchCase = readCase();
  const wanted = readHash();
  if (wanted) $("#q").value = wanted;
  else if (matchMedia("(pointer: fine)").matches) $("#q").focus();
  runSearch();
  if (open && views.length && views[0].result.order.length) showDetail(views[0], Number(open[1]), $("#q"));
}

start();
