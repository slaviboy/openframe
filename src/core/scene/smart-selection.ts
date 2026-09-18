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

import type { Rect } from '../math/rect';
import type { Vec2 } from '../math/vec';

/** A one-dimensional smart selection: layers in a row (`x`) or column (`y`) with one shared gap. */
export interface SmartSelection {
  readonly axis: 'x' | 'y';
  /** Indexes into the input rects, in order along the axis. */
  readonly order: readonly number[];
  readonly gap: number;
}

/** Gaps within this many pixels count as equal. */
const GAP_TOLERANCE = 0.5;

const along = (axis: 'x' | 'y', r: Rect) => (axis === 'x' ? { pos: r.x, size: r.width } : { pos: r.y, size: r.height });
const across = (axis: 'x' | 'y', r: Rect) => (axis === 'x' ? { pos: r.y, size: r.height } : { pos: r.x, size: r.width });

/**
 * Detects a smart selection: two or more rects ordered along one axis, where each neighbor pair
 * overlaps on the other axis and every gap between neighbors is the same (non-negative).
 * Rows are tried before columns. Returns null when the rects don't form one.
 */
export function detectSmartSelection(rects: readonly Rect[]): SmartSelection | null {
  if (rects.length < 2) return null;
  for (const axis of ['x', 'y'] as const) {
    const order = rects.map((_, i) => i).sort((a, b) => along(axis, rects[a]!).pos - along(axis, rects[b]!).pos);
    let gap: number | null = null;
    let valid = true;
    for (let k = 1; k < order.length && valid; k++) {
      const prev = rects[order[k - 1]!]!;
      const cur = rects[order[k]!]!;
      const g = along(axis, cur).pos - (along(axis, prev).pos + along(axis, prev).size);
      const a = across(axis, prev);
      const b = across(axis, cur);
      const overlaps = b.pos < a.pos + a.size && a.pos < b.pos + b.size;
      if (g < -GAP_TOLERANCE || !overlaps || (gap !== null && Math.abs(g - gap) > GAP_TOLERANCE)) valid = false;
      else gap ??= g;
    }
    if (valid && gap !== null) return { axis, order, gap: Math.max(0, Math.round(gap * 100) / 100) };
  }
  return null;
}

/**
 * A two-dimensional smart selection: layers arranged in a grid, every row holding the same number of them with
 * one shared gap across, and the rows themselves one shared gap apart.
 */
export interface SmartGrid {
  /** Indexes into the input rects, row by row and left to right within each row. */
  readonly rows: readonly (readonly number[])[];
  readonly columnGap: number;
  readonly rowGap: number;
}

/**
 * Detects a grid: the rects fall into rows that overlap vertically, each row holding the same number of layers
 * with one shared gap between them, and the rows one shared gap apart. Returns null when they don't form one —
 * including when they form a single row or column, which is a one-dimensional selection instead.
 */
export function detectSmartGrid(rects: readonly Rect[]): SmartGrid | null {
  if (rects.length < 4) return null;
  const byTop = rects.map((_, i) => i).sort((a, b) => rects[a]!.y - rects[b]!.y);
  const rows: number[][] = [];
  for (const index of byTop) {
    const rect = rects[index]!;
    const row = rows.find((candidate) => candidate.some((other) => rects[other]!.y < rect.y + rect.height && rect.y < rects[other]!.y + rects[other]!.height));
    if (row) row.push(index);
    else rows.push([index]);
  }
  if (rows.length < 2) return null;
  for (const row of rows) row.sort((a, b) => rects[a]!.x - rects[b]!.x);
  // Every row holds the same number of layers, and they line up in columns, or the shape is not a grid.
  if (rows.some((row) => row.length !== rows[0]!.length) || rows[0]!.length < 2) return null;
  const columns = rows[0]!.length;
  for (let c = 0; c < columns; c++) {
    const left = rects[rows[0]![c]!]!.x;
    if (rows.some((row) => Math.abs(rects[row[c]!]!.x - left) > GAP_TOLERANCE)) return null;
  }

  const same = (values: readonly number[]): number | null => {
    const [first] = values;
    if (first === undefined) return null;
    return values.every((value) => Math.abs(value - first) <= GAP_TOLERANCE) ? Math.max(0, Math.round(first * 100) / 100) : null;
  };
  const acrossGaps: number[] = [];
  for (const row of rows) {
    for (let k = 1; k < row.length; k++) {
      const prev = rects[row[k - 1]!]!;
      acrossGaps.push(rects[row[k]!]!.x - (prev.x + prev.width));
    }
  }
  const downGaps: number[] = [];
  for (let r = 1; r < rows.length; r++) {
    const above = rows[r - 1]!.map((i) => rects[i]!);
    const below = rows[r]!.map((i) => rects[i]!);
    downGaps.push(Math.min(...below.map((rect) => rect.y)) - Math.max(...above.map((rect) => rect.y + rect.height)));
  }
  const columnGap = same(acrossGaps);
  const rowGap = same(downGaps);
  if (columnGap === null || rowGap === null || acrossGaps.some((gap) => gap < -GAP_TOLERANCE) || downGaps.some((gap) => gap < -GAP_TOLERANCE)) return null;
  return { rows, columnGap, rowGap };
}

/** Two layers of a selection with their places exchanged: each takes the other's corner, keeping its own size. */
export function swapPositions(rects: readonly Rect[], a: number, b: number): Vec2[] {
  const out = rects.map((r) => ({ x: r.x, y: r.y }));
  const first = rects[a];
  const second = rects[b];
  if (!first || !second || a === b) return out;
  out[a] = { x: second.x, y: second.y };
  out[b] = { x: first.x, y: first.y };
  return out;
}

/** New top-left corners after setting every gap to `gap`: the first layer stays, the others keep their cross position. */
export function respace(rects: readonly Rect[], selection: SmartSelection, gap: number): Vec2[] {
  const out = rects.map((r) => ({ x: r.x, y: r.y }));
  const [first, ...rest] = selection.order;
  if (first === undefined) return out;
  const g = Math.max(0, gap);
  let cursor = along(selection.axis, rects[first]!).pos + along(selection.axis, rects[first]!).size;
  for (const index of rest) {
    const rect = rects[index]!;
    const pos = cursor + g;
    out[index] = selection.axis === 'x' ? { x: pos, y: rect.y } : { x: rect.x, y: pos };
    cursor = pos + along(selection.axis, rect).size;
  }
  return out;
}

/** World positions of the spacing handles: the middle of each gap, centered on the neighbors' overlap. */
export function spacingHandles(rects: readonly Rect[], selection: SmartSelection): Vec2[] {
  const handles: Vec2[] = [];
  for (let k = 1; k < selection.order.length; k++) {
    const prev = rects[selection.order[k - 1]!]!;
    const cur = rects[selection.order[k]!]!;
    const end = along(selection.axis, prev).pos + along(selection.axis, prev).size;
    const mid = (end + along(selection.axis, cur).pos) / 2;
    const a = across(selection.axis, prev);
    const b = across(selection.axis, cur);
    const cross = (Math.max(a.pos, b.pos) + Math.min(a.pos + a.size, b.pos + b.size)) / 2;
    handles.push(selection.axis === 'x' ? { x: mid, y: cross } : { x: cross, y: mid });
  }
  return handles;
}

/** The places a grid holds, read row by row and left to right — the same order as `gridOrder`. */
export const gridOrder = (grid: SmartGrid): number[] => grid.rows.flatMap((row) => [...row]);

/** The left edge of each column and the top edge of each row, as the grid stands. */
function gridLines(rects: readonly Rect[], grid: SmartGrid): { readonly xs: number[]; readonly ys: number[]; readonly heights: number[] } {
  const xs = grid.rows[0]!.map((index) => rects[index]!.x);
  const ys = grid.rows.map((row) => Math.min(...row.map((index) => rects[index]!.y)));
  const heights = grid.rows.map((row, r) => Math.max(...row.map((index) => rects[index]!.y + rects[index]!.height)) - ys[r]!);
  return { xs, ys, heights };
}

/**
 * The top-left corner of each of the grid's places, row by row. Asking for more places than the grid holds carries
 * on below it, a row at a time, which is how a copy finds somewhere to go.
 */
export function gridSlots(rects: readonly Rect[], grid: SmartGrid, count = gridOrder(grid).length): Vec2[] {
  const { xs, ys, heights } = gridLines(rects, grid);
  const last = ys.length - 1;
  const out: Vec2[] = [];
  for (let n = 0; n < count; n++) {
    const r = Math.floor(n / xs.length);
    const y = r <= last ? ys[r]! : ys[last]! + (r - last) * (heights[last]! + grid.rowGap);
    out.push({ x: xs[n % xs.length]!, y });
  }
  return out;
}

/**
 * New top-left corners after setting the grid's two gaps: the first layer stays where it is, each column is as
 * wide as its widest layer and each row as tall as its tallest, and a layer keeps where it sits within its cell.
 */
export function respaceGrid(rects: readonly Rect[], grid: SmartGrid, columnGap: number, rowGap: number): Vec2[] {
  const { xs, ys } = gridLines(rects, grid);
  const widths = xs.map((_, c) => Math.max(...grid.rows.map((row) => rects[row[c]!]!.width)));
  const heights = grid.rows.map((row) => Math.max(...row.map((index) => rects[index]!.height)));
  const placed = (sizes: readonly number[], start: number, gap: number): number[] => {
    let cursor = start;
    return sizes.map((size) => {
      const at = cursor;
      cursor += size + Math.max(0, gap);
      return at;
    });
  };
  const left = placed(widths, xs[0]!, columnGap);
  const top = placed(heights, ys[0]!, rowGap);
  const out = rects.map((r) => ({ x: r.x, y: r.y }));
  for (const [r, row] of grid.rows.entries()) {
    for (const [c, index] of row.entries()) {
      const rect = rects[index]!;
      out[index] = { x: left[c]! + (rect.x - xs[c]!), y: top[r]! + (rect.y - ys[r]!) };
    }
  }
  return out;
}

/** A spacing handle of a grid: where it sits, and which of the two gaps dragging it changes. */
export interface GridSpacingHandle {
  readonly point: Vec2;
  readonly axis: 'x' | 'y';
}

/** The middle of every gap in the grid: between neighbours in a row, and between the rows themselves. */
export function gridSpacingHandles(rects: readonly Rect[], grid: SmartGrid): GridSpacingHandle[] {
  const handles: GridSpacingHandle[] = [];
  for (const row of grid.rows) {
    for (let k = 1; k < row.length; k++) {
      const prev = rects[row[k - 1]!]!;
      const cur = rects[row[k]!]!;
      const cross = (Math.max(prev.y, cur.y) + Math.min(prev.y + prev.height, cur.y + cur.height)) / 2;
      handles.push({ point: { x: (prev.x + prev.width + cur.x) / 2, y: cross }, axis: 'x' });
    }
  }
  for (let r = 1; r < grid.rows.length; r++) {
    const above = grid.rows[r - 1]!;
    const below = grid.rows[r]!;
    const bottom = Math.max(...above.map((index) => rects[index]!.y + rects[index]!.height));
    const top = Math.min(...below.map((index) => rects[index]!.y));
    for (const [c, index] of below.entries()) {
      const rect = rects[index]!;
      const over = rects[above[c]!]!;
      const cross = (Math.max(rect.x, over.x) + Math.min(rect.x + rect.width, over.x + over.width)) / 2;
      handles.push({ point: { x: cross, y: (bottom + top) / 2 }, axis: 'y' });
    }
  }
  return handles;
}
