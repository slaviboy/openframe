/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Reads the brushes out of the saved the reference pages in reference/app/ and writes
// src/core/vector/brushes-reference.ts. Run: npm run brushes:reference
//
// The saved pages hold each brush as a name, the heading it sits under, and a 756 x 108 picture of the
// stroke it makes. They do not hold the reference's vector shapes — nothing in the capture does — so the shape a
// brush paints is read back out of its picture: the alpha is thresholded, its components are traced as
// loops of pixel corners (the outer one and every hole), and the loops are simplified. A stretch brush is
// the whole picture; a scatter brush is a spray, so its mark is the median speck and its Gap, Wiggle, Size
// jitter and Angular jitter are measured from where the specks fell, how far they strayed across the band,
// how much their sizes varied and how much they turned.
//
// The input is gitignored (it is the reference's markup, 33 MB), so this script is the only committed record of
// how the artwork got in, as scripts/extract-reference-icons.mjs is for the icons. Unlike that one it writes
// rather than prints: twenty-five traces are not something to paste by hand. See docs/UI_REFERENCE.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');
const CK = await CanvasKitInit({ locateFile: (f) => require.resolve(`canvaskit-wasm/bin/full/${f}`) });

const PAGE = 'reference/app/brushes_streched.html';
const OUT = 'src/core/vector/brushes-reference.ts';

/** Ink at or above this alpha is the brush; below it is the page behind the picture. */
const THRESHOLD = 128;
/** Components smaller than this are noise from the picture's own antialiasing, not flecks of the brush. */
const MIN_AREA = 4;
/** How far a traced loop may stray from the pixels it came from, in picture pixels. */
const TOLERANCE = 1;
/** A scatter brush's mark is a few pixels of speck, so its loops are kept far closer to the ink. */
const MARK_TOLERANCE = 0.5;

/** Every brush row of the Brushes list: its name, the heading above it, and the picture of its stroke. */
function readRows(html) {
  const start = html.indexOf('brush-list-modal');
  if (start < 0) throw new Error(`No Brushes list in ${PAGE}`);
  const body = html.slice(start, start + 2_000_000);
  const pattern = /brushTypeSubheader[^>]*>([^<]+)<\/h3>|brushName--hLoPK>([^<]+)<\/span>[\s\S]*?src="?(data:image\/png;base64,[A-Za-z0-9+/=]+)"?/g;
  const rows = [];
  let kind = null;
  for (const match of body.matchAll(pattern)) {
    if (match[1]) {
      kind = /stretch/i.test(match[1]) ? 'STRETCH' : 'SCATTER';
      continue;
    }
    if (kind === null) throw new Error('A brush before any heading');
    rows.push({ name: decodeEntities(match[2]), kind, png: match[3] });
  }
  return rows;
}

const decodeEntities = (text) => text.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#x27;', "'");

/** A picture's alpha, as one row of bytes per line. */
function alphaOf(dataUrl) {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const image = CK.MakeImageFromEncoded(bytes);
  if (!image) throw new Error('Could not decode a brush picture');
  const width = image.width();
  const height = image.height();
  const pixels = image.readPixels(0, 0, { width, height, colorType: CK.ColorType.RGBA_8888, alphaType: CK.AlphaType.Unpremul, colorSpace: CK.ColorSpace.SRGB });
  image.delete();
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(width);
    for (let x = 0; x < width; x++) row[x] = pixels[(y * width + x) * 4 + 3];
    rows.push(row);
  }
  return { width, height, rows };
}

/** The ink's connected components, each as its own pixels. */
function components({ width, height, rows }) {
  const seen = new Uint8Array(width * height);
  const found = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y][x] < THRESHOLD || seen[y * width + x]) continue;
      const pixels = [];
      const queue = [x, y];
      seen[y * width + x] = 1;
      while (queue.length > 0) {
        const py = queue.pop();
        const px = queue.pop();
        pixels.push(px, py);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (rows[ny][nx] < THRESHOLD || seen[ny * width + nx]) continue;
          seen[ny * width + nx] = 1;
          queue.push(nx, ny);
        }
      }
      found.push(pixels);
    }
  }
  return found;
}

/**
 * The boundaries of a set of pixels, as closed loops of the corners between them: the outer one and one per
 * hole. Each pixel gives the edges that face a pixel that is not in the set, wound so that the ink is on
 * the same side all the way round — so the renderer's non-zero fill leaves the holes open.
 */
function boundaries(pixels) {
  const has = new Set();
  for (let i = 0; i < pixels.length; i += 2) has.add(`${pixels[i]},${pixels[i + 1]}`);
  const edges = new Map();
  const add = (from, to) => {
    const list = edges.get(from);
    if (list) list.push(to);
    else edges.set(from, [to]);
  };
  for (let i = 0; i < pixels.length; i += 2) {
    const x = pixels[i];
    const y = pixels[i + 1];
    if (!has.has(`${x},${y - 1}`)) add(`${x},${y}`, `${x + 1},${y}`);
    if (!has.has(`${x + 1},${y}`)) add(`${x + 1},${y}`, `${x + 1},${y + 1}`);
    if (!has.has(`${x},${y + 1}`)) add(`${x + 1},${y + 1}`, `${x},${y + 1}`);
    if (!has.has(`${x - 1},${y}`)) add(`${x},${y + 1}`, `${x},${y}`);
  }
  const loops = [];
  while (edges.size > 0) {
    const start = edges.keys().next().value;
    const loop = [];
    let at = start;
    for (;;) {
      const next = edges.get(at);
      if (!next || next.length === 0) break;
      const step = next.pop();
      if (next.length === 0) edges.delete(at);
      loop.push(at);
      at = step;
      if (at === start) break;
    }
    if (loop.length > 3) loops.push(loop.map((key) => key.split(',').map(Number)));
  }
  return loops;
}

/** Douglas–Peucker: the loop with every point that its neighbours already say where it is taken out. */
function simplify(loop, tolerance) {
  const walk = (points) => {
    if (points.length < 3) return points;
    const [ax, ay] = points[0];
    const [bx, by] = points[points.length - 1];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let worst = -1;
    let at = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const [px, py] = points[i];
      const away = length > 0 ? Math.abs(dx * (ay - py) - dy * (ax - px)) / length : Math.hypot(px - ax, py - ay);
      if (away > worst) {
        worst = away;
        at = i;
      }
    }
    if (worst <= tolerance) return [points[0], points[points.length - 1]];
    return [...walk(points.slice(0, at + 1)).slice(0, -1), ...walk(points.slice(at))];
  };
  const closed = walk([...loop, loop[0]]);
  return closed.slice(0, -1);
}

const areaOf = (loop) => {
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % loop.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
};

/** Where a component sits and how big it is. */
function boundsOf(pixels) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pixels.length; i += 2) {
    x0 = Math.min(x0, pixels[i]);
    x1 = Math.max(x1, pixels[i]);
    y0 = Math.min(y0, pixels[i + 1]);
    y1 = Math.max(y1, pixels[i + 1]);
  }
  return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1, area: pixels.length / 2 };
}

/** A component's middle, and the way it lies: the angle of the line its pixels spread furthest along. */
function momentsOf(pixels) {
  const n = pixels.length / 2;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < pixels.length; i += 2) {
    sx += pixels[i];
    sy += pixels[i + 1];
  }
  const cx = sx / n;
  const cy = sy / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let i = 0; i < pixels.length; i += 2) {
    const dx = pixels[i] - cx;
    const dy = pixels[i + 1] - cy;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  return { cx, cy, angle: 0.5 * Math.atan2(2 * (xy / n), xx / n - yy / n) };
}

/** The whole picture traced into loops, placed in a box of its own ink's bounds. */
function traceStretch(alpha) {
  const kept = components(alpha).filter((pixels) => pixels.length / 2 >= MIN_AREA);
  const ink = boundsOf(kept.flat());
  const polygons = [];
  for (const pixels of kept) {
    for (const loop of boundaries(pixels)) {
      const points = simplify(loop, TOLERANCE);
      if (points.length < 3) continue;
      polygons.push(points.map(([x, y]) => [x - ink.x0, y - ink.y0]));
    }
  }
  return { polygons, size: { width: ink.width, height: ink.height } };
}

/**
 * A scatter brush read out of its picture. Two of them are drawn there: a spray, whose specks fall apart
 * from each other, and a dense one, whose marks overlap into a band. A spray's mark is the speck of the
 * middling size; a dense one's is a slice of the band as wide as the band is thick. Either way the mark
 * sits in a box as tall as the band, so it is the right size against the stroke's weight, and what is
 * measured is what the picture can say: how far apart the marks sit, how far they stray across the band,
 * how much their size varies and how much they turn.
 */
function traceScatter(alpha) {
  const all = components(alpha);
  const ink = boundsOf(all.flat());
  const coverage = (all.reduce((sum, pixels) => sum + pixels.length / 2, 0) / Math.max(ink.width * ink.height, 1)) || 0;
  const biggest = all.reduce((best, pixels) => (pixels.length > best.length ? pixels : best), all[0] ?? []);
  const dense = boundsOf(biggest).width > alpha.width / 4;
  const cut = dense ? sliceOfBand(alpha, all.flat(), ink) : null;
  // A slice that came back empty is no mark: the speck of the middling size stands in for it.
  const mark = cut && cut.pixels.length > 0 ? cut : medianSpeck(all, alpha);

  // A mark cut out of the band is the stroke's own cross-section, so it fills the weight; a speck is a
  // mark within a band, so it keeps the band's thickness around it and Wiggle spreads it over that.
  const size = { width: Math.max(mark.bounds.width, 1), height: Math.max(mark.patch ? mark.bounds.height : ink.height, 1) };
  const polygons = [];
  for (const loop of boundaries(mark.pixels)) {
    const points = simplify(loop, MARK_TOLERANCE);
    if (points.length < 3) continue;
    // Centred in the box, so the mark sits on the path with the band's own thickness around it.
    polygons.push(points.map(([x, y]) => [x - mark.bounds.x0 + (size.width - mark.bounds.width) / 2, y - mark.bounds.y0 + (size.height - mark.bounds.height) / 2]));
  }

  // The marks are laid as close together as the ink they left asks for: a mark of this area, every step,
  // covering this share of the band.
  const markArea = mark.bounds.area;
  const step = markArea / Math.max(coverage * ink.height, 0.001);
  const gap = clamp(Math.round((step / Math.max(mark.bounds.width, 1) - 1) * 100), 0, 1000);
  const band = bandProfile(alpha, ink);
  const settings = mark.patch
    ? {
        // A mark cut out of the band carries the band's own wander, grain and tilt already: laying it down
        // with a gap, across the path or turned would be that same roughness a second time, and would break
        // a continuous stroke into steps. Only the size varies, as the band's own thickness does.
        gap: 0,
        wiggle: 0,
        sizeJitter: clamp(Math.round((spread(band.thicknesses) / Math.max(mean(band.thicknesses), 1)) * 100), 0, 30),
        angularJitter: 0,
      }
    : {
        gap,
        // How far the specks reach across the band, edge to edge rather than about their middle.
        wiggle: clamp(Math.round((range(mark.pool.map((speck) => speck.moments.cy)) / Math.max(ink.height, 1)) * 100), 0, 100),
        sizeJitter: clamp(Math.round((spread(mark.pool.map((speck) => speck.bounds.area)) / Math.max(mean(mark.pool.map((speck) => speck.bounds.area)), 1)) * 100), 0, 100),
        angularJitter: clamp(Math.round(2 * spread(mark.pool.map((speck) => (speck.moments.angle * 180) / Math.PI))), 0, 360),
      };
  return { polygons, size, settings, coverage: Math.round(coverage * 1000) / 1000 };
}

/** The speck of the middling size, out of the ones that are marks rather than a band they ran into. */
function medianSpeck(all, alpha) {
  const specks = all.map((pixels) => ({ pixels, bounds: boundsOf(pixels), moments: momentsOf(pixels) }));
  const marks = specks.filter((speck) => speck.bounds.area >= MIN_AREA && speck.bounds.width < alpha.width / 4);
  const pool = marks.length >= 8 ? marks : specks;
  const sorted = [...pool].sort((a, b) => a.bounds.area - b.bounds.area);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { pixels: median.pixels, bounds: median.bounds, pool, patch: false };
}

/**
 * A mark cut out of a band, as long as the band is thick twice over and levelled onto a straight axis: the
 * band in the picture wanders as the stroke it was drawn along did, and a mark still carrying that wander
 * would step away from the path every time it was laid down. Its grain and its ragged edges stay.
 */
function sliceOfBand(alpha, pixels, ink) {
  const width = Math.max(Math.round(ink.height * 2), 2);
  const columns = new Array(alpha.width).fill(0);
  for (let i = 0; i < pixels.length; i += 2) columns[pixels[i]] += 1;
  const windows = [];
  for (let x = ink.x0; x + width <= ink.x1; x++) {
    let sum = 0;
    let thinnest = Infinity;
    for (let k = 0; k < width; k++) {
      sum += columns[x + k];
      thinnest = Math.min(thinnest, columns[x + k]);
    }
    windows.push({ x, sum, thinnest });
  }
  // A mark cut across a column the band left empty would carry that gap, and every copy of it would show
  // the gap again as a slit through the stroke — so the cut is made where the band is whole. Among those,
  // the one carrying as much ink as such a place usually does, rather than the heaviest.
  const whole = windows.filter((window) => window.thinnest > 0);
  const inked = (whole.length > 0 ? whole : windows.filter((window) => window.sum > 0)).sort((a, b) => a.sum - b.sum);
  const best = (inked[Math.floor(inked.length / 2)] ?? windows[0] ?? { x: ink.x0 }).x;

  // Where the band's middle runs, smoothed over a quarter of its thickness so the wander is levelled and
  // the grain is not.
  const middles = centreLine(alpha, ink);
  const smooth = Math.max(2, Math.round(ink.height / 4));
  const levelled = middles.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, i - smooth); k <= Math.min(middles.length - 1, i + smooth); k++) {
      if (middles[k] === null) continue;
      sum += middles[k];
      count += 1;
    }
    return count > 0 ? sum / count : null;
  });
  const middle = ink.y0 + ink.height / 2;

  const slice = [];
  for (let i = 0; i < pixels.length; i += 2) {
    const x = pixels[i];
    if (x < best || x >= best + width) continue;
    const at = levelled[x - ink.x0];
    slice.push(x, pixels[i + 1] - Math.round((at ?? middle) - middle));
  }
  return { pixels: trimEdges(slice), bounds: boundsOf(trimEdges(slice)), pool: [], patch: true };
}

/**
 * A mark with its thin edges cut off. A mark is laid down end to end with the next one, so a first or last
 * column carrying a speck and little else would leave a hairline of nothing between the two.
 */
function trimEdges(pixels) {
  const columns = new Map();
  for (let i = 0; i < pixels.length; i += 2) columns.set(pixels[i], (columns.get(pixels[i]) ?? 0) + 1);
  const counts = [...columns.values()].sort((a, b) => a - b);
  const solid = (counts[Math.floor(counts.length / 2)] ?? 0) * 0.35;
  const xs = [...columns.keys()].sort((a, b) => a - b);
  let low = xs[0];
  let high = xs[xs.length - 1];
  while (low < high && (columns.get(low) ?? 0) < solid) low += 1;
  while (high > low && (columns.get(high) ?? 0) < solid) high -= 1;
  const out = [];
  for (let i = 0; i < pixels.length; i += 2) if (pixels[i] >= low && pixels[i] <= high) out.push(pixels[i], pixels[i + 1]);
  return out.length > 0 ? out : pixels;
}

/** Where the ink's middle sits in each column of the picture, or null where a column carries none. */
function centreLine(alpha, ink) {
  const out = [];
  for (let x = ink.x0; x <= ink.x1; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y < alpha.height; y++) {
      if (alpha.rows[y][x] < THRESHOLD) continue;
      sum += y;
      count += 1;
    }
    out.push(count > 0 ? sum / count : null);
  }
  return out;
}

/** How the band runs along the picture: where its middle is, how thick it is, and which way it tilts. */
function bandProfile(alpha, ink) {
  const middles = [];
  const thicknesses = [];
  for (let x = ink.x0; x <= ink.x1; x++) {
    let sum = 0;
    let count = 0;
    let top = Infinity;
    let bottom = -Infinity;
    for (let y = 0; y < alpha.height; y++) {
      if (alpha.rows[y][x] < THRESHOLD) continue;
      sum += y;
      count += 1;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    if (count === 0) continue;
    middles.push(sum / count);
    thicknesses.push(bottom - top + 1);
  }
  // The tilt over a window as wide as the band is thick, in degrees, and then how much that tilt changes
  // from one window to the next: a band that curves is on a trend, while a turned mark is a jump off it.
  const window = Math.max(2, Math.round(ink.height));
  const tilts = [];
  for (let i = 0; i + window < middles.length; i += window) tilts.push((Math.atan2(middles[i + window] - middles[i], window) * 180) / Math.PI);
  const angles = tilts.slice(1).map((tilt, i) => tilt - tilts[i]);
  return { middles, thicknesses, angles: angles.length > 0 ? angles : [0] };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
const range = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 1 ? (sorted[Math.floor(sorted.length * 0.95)] ?? 0) - (sorted[Math.floor(sorted.length * 0.05)] ?? 0) : 0;
};
const mean = (values) => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const spread = (values) => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
};

const round = (value) => Math.round(value * 10) / 10;

function main() {
  const html = readFileSync(PAGE, 'utf8');
  const rows = readRows(html);
  console.log(`${rows.length} brushes in ${PAGE}`);
  const brushes = rows.map((row, index) => {
    const alpha = alphaOf(row.png);
    const traced = row.kind === 'STRETCH' ? traceStretch(alpha) : traceScatter(alpha);
    const polygons = traced.polygons;
    const points = polygons.reduce((sum, loop) => sum + loop.length, 0);
    console.log(`  ${row.name.padEnd(18)} ${row.kind.padEnd(8)} ${String(polygons.length).padStart(4)} loops ${String(points).padStart(6)} points`);
    return { id: `0:${index + 1}`, name: row.name, kind: row.kind, size: traced.size, polygons, settings: traced.settings };
  });

  const body = brushes
    .map((brush) => {
      const polygons = brush.polygons.map((loop) => `      [${loop.map(([x, y]) => `${round(x)},${round(y)}`).join(', ')}]`).join(',\n');
      const settings = brush.settings ? `\n    settings: { gap: ${brush.settings.gap}, wiggle: ${brush.settings.wiggle}, sizeJitter: ${brush.settings.sizeJitter}, angularJitter: ${brush.settings.angularJitter} },` : '';
      return `  {
    id: '${brush.id}',
    name: ${JSON.stringify(brush.name)},
    kind: '${brush.kind}',
    size: { width: ${round(brush.size.width)}, height: ${round(brush.size.height)} },${settings}
    polygons: [
${polygons},
    ],
  }`;
    })
    .join(',\n');

  const file = `/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Generated by scripts/extract-reference-brushes.mjs — do not edit by hand.
//
// The brushes of the reference's own list, in its order and under its two headings. Their names and kinds
// are the capture's; each shape is traced from the capture's picture of the stroke that brush makes, and a
// scatter brush's settings are measured from where its specks fell. See docs/UI_REFERENCE.md.

/** A brush as it was read out of the capture: the mark it paints, in a box, with what a spray was scattered by. */
export interface ReferenceBrush {
  readonly id: string;
  readonly name: string;
  readonly kind: 'STRETCH' | 'SCATTER';
  readonly size: { readonly width: number; readonly height: number };
  /** Closed loops of the shape, as flat x, y pairs in the box's own space. */
  readonly polygons: readonly (readonly number[])[];
  /** Scatter only: how far apart its marks sit and how far each may stray. */
  readonly settings?: { readonly gap: number; readonly wiggle: number; readonly sizeJitter: number; readonly angularJitter: number };
}

export const REFERENCE_BRUSHES: readonly ReferenceBrush[] = [
${body},
];
`;
  writeFileSync(OUT, file);
  const points = brushes.reduce((sum, brush) => sum + brush.polygons.reduce((n, loop) => n + loop.length, 0), 0);
  console.log(`\nWrote ${OUT}: ${brushes.length} brushes, ${points} points, ${Math.round(file.length / 1024)} KB`);
}

main();
