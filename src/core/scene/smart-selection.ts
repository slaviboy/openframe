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
