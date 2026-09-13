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

import type { Rect } from './rect';
import { lerp, type Vec2 } from './vec';

/** Cubic Bézier segment p0 → p3 with control points p1, p2. */
export interface Cubic {
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
  readonly p3: Vec2;
}

export function pointAt(c: Cubic, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const d = 3 * mt * t * t;
  const e = t * t * t;
  return {
    x: a * c.p0.x + b * c.p1.x + d * c.p2.x + e * c.p3.x,
    y: a * c.p0.y + b * c.p1.y + d * c.p2.y + e * c.p3.y,
  };
}

/** De Casteljau split at t. */
export function split(c: Cubic, t: number): [Cubic, Cubic] {
  const p01 = lerp(c.p0, c.p1, t);
  const p12 = lerp(c.p1, c.p2, t);
  const p23 = lerp(c.p2, c.p3, t);
  const p012 = lerp(p01, p12, t);
  const p123 = lerp(p12, p23, t);
  const mid = lerp(p012, p123, t);
  return [
    { p0: c.p0, p1: p01, p2: p012, p3: mid },
    { p0: mid, p1: p123, p2: p23, p3: c.p3 },
  ];
}

/** Roots in (0,1) of the derivative for one axis: a*t^2 + b*t + c = 0. */
function extremaParams(v0: number, v1: number, v2: number, v3: number): number[] {
  const a = -v0 + 3 * v1 - 3 * v2 + v3;
  const b = 2 * (v0 - 2 * v1 + v2);
  const c = v1 - v0;
  const out: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) out.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      out.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return out.filter((t) => t > 0 && t < 1);
}

/** Exact axis-aligned bounds (endpoints plus curve extrema). */
export function bounds(c: Cubic): Rect {
  const ts = [
    0,
    1,
    ...extremaParams(c.p0.x, c.p1.x, c.p2.x, c.p3.x),
    ...extremaParams(c.p0.y, c.p1.y, c.p2.y, c.p3.y),
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of ts) {
    const p = pointAt(c, t);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Approximate arc length by summing a uniformly sampled polyline. */
export function arcLength(c: Cubic, samples = 32): number {
  let len = 0;
  let prev = c.p0;
  for (let i = 1; i <= samples; i++) {
    const p = pointAt(c, i / samples);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

/** Closest parameter t on the curve to point p (coarse sample + Newton refinement). */
export function nearestT(c: Cubic, p: Vec2, samples = 24): number {
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const q = pointAt(c, t);
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  let lo = Math.max(0, bestT - 1 / samples);
  let hi = Math.min(1, bestT + 1 / samples);
  for (let i = 0; i < 20; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const q1 = pointAt(c, m1);
    const q2 = pointAt(c, m2);
    const d1 = (q1.x - p.x) ** 2 + (q1.y - p.y) ** 2;
    const d2 = (q2.x - p.x) ** 2 + (q2.y - p.y) ** 2;
    if (d1 < d2) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}
