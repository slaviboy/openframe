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

/** A measured distance, drawn as a line from `from` to `to` with a label. */
export interface MeasureLine {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly distance: number;
  readonly axis: 'x' | 'y';
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Center of the overlap of [a0, a1] and [b0, b1], or null when they don't overlap. */
function overlapCenter(a0: number, a1: number, b0: number, b1: number): number | null {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return lo <= hi ? (lo + hi) / 2 : null;
}

const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/** Where a shape reaches along one axis at a given height or position across it, or null when it isn't there. */
function spanAt(polygon: readonly Vec2[], axis: 'x' | 'y', at: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    // The edge is cut by the line across the other axis; where it crosses says how far the shape reaches here.
    const [pa, qa] = axis === 'x' ? [p.y, q.y] : [p.x, q.x];
    const [pb, qb] = axis === 'x' ? [p.x, q.x] : [p.y, q.y];
    if (pa === qa) {
      if (pa !== at) continue;
      lo = Math.min(lo, pb, qb);
      hi = Math.max(hi, pb, qb);
      continue;
    }
    const t = (at - pa) / (qa - pa);
    if (t < 0 || t > 1) continue;
    const value = pb + (qb - pb) * t;
    lo = Math.min(lo, value);
    hi = Math.max(hi, value);
  }
  return lo <= hi ? [lo, hi] : null;
}

/** The smallest box a shape sits in, which says where it overlaps the selection. */
function boundsOf(polygon: readonly Vec2[]): Rect {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/**
 * Distances from the selection `a` to a layer whose outline is turned, measured to the outline itself rather than
 * to the box around it: each line is drawn across the middle of where the two overlap, and reaches the edge the
 * shape really has at that height.
 */
export function measureToOutline(a: Rect, polygon: readonly Vec2[]): MeasureLine[] {
  if (polygon.length < 3) return [];
  const lines: MeasureLine[] = [];
  const push = (from: Vec2, to: Vec2, axis: 'x' | 'y') => {
    const distance = round2(axis === 'x' ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y));
    if (distance > 0) lines.push({ from, to, distance, axis });
  };
  const b = boundsOf(polygon);
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;

  const y = overlapCenter(a.y, aBottom, b.y, b.y + b.height);
  const across = y === null ? null : spanAt(polygon, 'x', y);
  if (y !== null && across) {
    if (across[0] >= aRight) push({ x: aRight, y }, { x: across[0], y }, 'x');
    else if (across[1] <= a.x) push({ x: across[1], y }, { x: a.x, y }, 'x');
  }

  const x = overlapCenter(a.x, aRight, b.x, b.x + b.width);
  const down = x === null ? null : spanAt(polygon, 'y', x);
  if (x !== null && down) {
    if (down[0] >= aBottom) push({ x, y: aBottom }, { x, y: down[0] }, 'y');
    else if (down[1] <= a.y) push({ x, y: down[1] }, { x, y: a.y }, 'y');
  }
  return lines;
}

/**
 * Distances shown while holding ⌥ between the selection `a` and another layer `b`:
 * - when one contains the other, the four distances from the inner rectangle's edges to the
 *   outer rectangle's edges, through the inner rectangle's center (zero distances omitted);
 * - otherwise the horizontal gap and/or the vertical gap between them, drawn through the middle
 *   of their overlap on the other axis (or the selection's center when they don't overlap).
 */
export function measureBetween(a: Rect, b: Rect): MeasureLine[] {
  const lines: MeasureLine[] = [];
  const push = (from: Vec2, to: Vec2, axis: 'x' | 'y') => {
    const distance = round2(axis === 'x' ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y));
    if (distance > 0) lines.push({ from, to, distance, axis });
  };

  if (contains(b, a) || contains(a, b)) {
    const [inner, outer] = contains(b, a) ? [a, b] : [b, a];
    const cx = inner.x + inner.width / 2;
    const cy = inner.y + inner.height / 2;
    push({ x: outer.x, y: cy }, { x: inner.x, y: cy }, 'x');
    push({ x: inner.x + inner.width, y: cy }, { x: outer.x + outer.width, y: cy }, 'x');
    push({ x: cx, y: outer.y }, { x: cx, y: inner.y }, 'y');
    push({ x: cx, y: inner.y + inner.height }, { x: cx, y: outer.y + outer.height }, 'y');
    return lines;
  }

  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;
  if (aRight <= b.x || bRight <= a.x) {
    const y = overlapCenter(a.y, aBottom, b.y, bBottom) ?? a.y + a.height / 2;
    const [left, right] = aRight <= b.x ? [a, b] : [b, a];
    push({ x: left.x + left.width, y }, { x: right.x, y }, 'x');
  }
  if (aBottom <= b.y || bBottom <= a.y) {
    const x = overlapCenter(a.x, aRight, b.x, bRight) ?? a.x + a.width / 2;
    const [top, bottom] = aBottom <= b.y ? [a, b] : [b, a];
    push({ x, y: top.y + top.height }, { x, y: bottom.y }, 'y');
  }
  return lines;
}
