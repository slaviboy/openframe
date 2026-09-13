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

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

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
