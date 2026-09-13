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

import { apply, type Matrix } from './matrix';
import type { Vec2 } from './vec';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
export const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const right = (r: Rect): number => r.x + r.width;
export const bottom = (r: Rect): number => r.y + r.height;
export const center = (r: Rect): Vec2 => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Normalizes a rect spanned by two arbitrary corner points. */
export function fromPoints(p1: Vec2, p2: Vec2): Rect {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  return { x, y, width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y) };
}

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(right(a), right(b)) - x, height: Math.max(bottom(a), bottom(b)) - y };
}

export function unionAll(rects: Iterable<Rect>): Rect | null {
  let acc: Rect | null = null;
  for (const r of rects) acc = acc ? union(acc, r) : r;
  return acc;
}

export const intersects = (a: Rect, b: Rect): boolean =>
  a.x <= right(b) && right(a) >= b.x && a.y <= bottom(b) && bottom(a) >= b.y;

/** True when `inner` lies entirely within `outer`. */
export const contains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && right(inner) <= right(outer) && bottom(inner) <= bottom(outer);

export const containsPoint = (r: Rect, p: Vec2): boolean =>
  p.x >= r.x && p.x <= right(r) && p.y >= r.y && p.y <= bottom(r);

export const expand = (r: Rect, amount: number): Rect => ({
  x: r.x - amount,
  y: r.y - amount,
  width: r.width + amount * 2,
  height: r.height + amount * 2,
});

export const corners = (r: Rect): [Vec2, Vec2, Vec2, Vec2] => [
  { x: r.x, y: r.y },
  { x: right(r), y: r.y },
  { x: right(r), y: bottom(r) },
  { x: r.x, y: bottom(r) },
];

/** Axis-aligned bounds of a rect after an affine transform. */
export function transformRect(m: Matrix, r: Rect): Rect {
  const pts = corners(r).map((p) => apply(m, p));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
