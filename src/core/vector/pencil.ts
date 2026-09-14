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

import { distanceToSegment } from '../geometry/shapes';
import type { Vec2 } from '../math/vec';
import { straightSegment, type VectorNetwork, type VectorSegment } from './vector-network';

/** Avoids negative zero in computed offsets. */
const clean = (v: number) => (v === 0 ? 0 : v);

/** Ramer–Douglas–Peucker: the fewest points that keep the polyline within `tolerance` of the original. */
export function simplifyPolyline(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return [...points];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let farthest = 0;
  let distance = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i]!, first, last);
    if (d > distance) {
      distance = d;
      farthest = i;
    }
  }
  if (distance <= tolerance) return [first, last];
  const left = simplifyPolyline(points.slice(0, farthest + 1), tolerance);
  return [...left.slice(0, -1), ...simplifyPolyline(points.slice(farthest), tolerance)];
}

/** An open path through the points, smoothed into Bézier curves with Catmull–Rom tangents (two points stay straight). */
export function smoothPath(points: readonly Vec2[]): VectorNetwork {
  const vertices = points.map((p) => ({ x: p.x, y: p.y }));
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]!;
  const segments: VectorSegment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    if (points.length === 2) {
      segments.push(straightSegment(0, 1));
      break;
    }
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    segments.push({
      start: i,
      end: i + 1,
      tangentStart: { x: clean((p2.x - p0.x) / 6), y: clean((p2.y - p0.y) / 6) },
      tangentEnd: { x: clean(-(p3.x - p1.x) / 6), y: clean(-(p3.y - p1.y) / 6) },
    });
  }
  return { vertices, segments, regions: [] };
}

/**
 * A pencil sketch as a vector network: the pointer's path simplified within `tolerance` and smoothed.
 * With `straight` (⇧), a single straight segment from the first point to the last.
 */
export function pencilNetwork(points: readonly Vec2[], options: { readonly tolerance?: number; readonly straight?: boolean } = {}): VectorNetwork {
  if (points.length === 0) return { vertices: [], segments: [], regions: [] };
  const kept = options.straight ? [points[0]!, points[points.length - 1]!] : simplifyPolyline(points, options.tolerance ?? 1);
  return smoothPath(kept.length === 1 ? [kept[0]!, kept[0]!] : kept);
}
