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

import type { Vec2 } from '../math/vec';

/** Maps points so that the bounds of `reference` fill the box (0,0)–(width,height). */
function fitToBox(points: readonly Vec2[], reference: readonly Vec2[], width: number, height: number): Vec2[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of reference) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const sx = maxX > minX ? width / (maxX - minX) : 0;
  const sy = maxY > minY ? height / (maxY - minY) : 0;
  return points.map((p) => ({ x: (p.x - minX) * sx, y: (p.y - minY) * sy }));
}

const clampCount = (count: number): number => Math.min(60, Math.max(3, Math.round(count)));

/**
 * Vertices of a regular polygon whose first vertex points up, scaled so its bounds fill the
 * layer box (a triangle spans the full width and height of its layer).
 */
export function polygonPoints(width: number, height: number, count: number): Vec2[] {
  const n = clampCount(count);
  const raw = Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
  return fitToBox(raw, raw, width, height);
}

/**
 * Star outline alternating outer and inner vertices (first outer vertex points up).
 * `innerRadius` is the inner/outer radius ratio (0–1). Bounds of the outer vertices fill the box.
 */
export function starPoints(width: number, height: number, count: number, innerRadius: number): Vec2[] {
  const n = clampCount(count);
  const ratio = Math.min(1, Math.max(0, innerRadius));
  const raw: Vec2[] = [];
  const outer: Vec2[] = [];
  for (let i = 0; i < n * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 === 0 ? 1 : ratio;
    const p = { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
    raw.push(p);
    if (i % 2 === 0) outer.push(p);
  }
  return fitToBox(raw, outer, width, height);
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/**
 * Largest usable radius for rounding vertex `v` between `prev` and `next`: the rounding's tangent
 * points sit `r / tan(θ / 2)` from the vertex and must stay within half of each adjacent edge.
 */
export function clampCornerRadius(prev: Vec2, v: Vec2, next: Vec2, radius: number): number {
  if (radius <= 0) return 0;
  const ax = prev.x - v.x;
  const ay = prev.y - v.y;
  const bx = next.x - v.x;
  const by = next.y - v.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la === 0 || lb === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)));
  const theta = Math.acos(cos);
  if (theta < 1e-6 || Math.PI - theta < 1e-6) return 0;
  const maxTangent = Math.min(la, lb) / 2;
  return Math.min(radius, maxTangent * Math.tan(theta / 2));
}

/** Length of arrow and marker end caps for a stroke weight (also their paint extent). */
export const lineCapSize = (strokeWeight: number): number => Math.max(6, strokeWeight * 4);
