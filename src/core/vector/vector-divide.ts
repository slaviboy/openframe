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
import { cutVertex, segmentPoint, splitSegment } from './vector-edit';
import type { VectorNetwork, VectorSegment } from './vector-network';

const SAMPLES = 64;
/** Crossings this close to a segment's ends are left alone: the cut would only touch an existing point. */
const END_MARGIN = 1e-6;

/** Where a segment crosses the cut line: the segment and the parameter along it. */
export interface LineCrossing {
  readonly segment: number;
  readonly t: number;
}

/**
 * Where the network's segments cross the straight cut from `a` to `b` (a Cut tool drag), only within the
 * drag's span. Each crossing is found where the segment passes from one side of the line to the other,
 * by sampling and then bisection.
 */
export function lineCrossings(network: VectorNetwork, a: Vec2, b: Vec2): LineCrossing[] {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return [];
  const side = (p: Vec2) => dx * (p.y - a.y) - dy * (p.x - a.x);
  const along = (p: Vec2) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  const crossings: LineCrossing[] = [];
  network.segments.forEach((_, segment) => {
    const at = (t: number) => segmentPoint(network, segment, t);
    // A point exactly on the line counts as the positive side, so a sample landing on it still marks the crossing.
    const sideOf = (t: number) => (side(at(t)) >= 0 ? 1 : -1);
    let previous = sideOf(0);
    for (let k = 1; k <= SAMPLES; k++) {
      const current = sideOf(k / SAMPLES);
      if (current !== previous) {
        let [lo, hi] = [(k - 1) / SAMPLES, k / SAMPLES];
        for (let n = 0; n < 40; n++) {
          const mid = (lo + hi) / 2;
          if (sideOf(mid) === previous) lo = mid;
          else hi = mid;
        }
        const t = (lo + hi) / 2;
        const u = along(at(t));
        if (u >= 0 && u <= 1 && t > END_MARGIN && t < 1 - END_MARGIN) crossings.push({ segment, t });
      }
      previous = current;
    }
  });
  return crossings;
}

/**
 * Cuts the network along the straight line from `a` to `b`: every segment is split where it crosses the
 * line, and the path is broken at each new point (`cutVertex`), so it comes apart there. Regions whose
 * outline is broken lose their fill. Returns the network and how many cuts were made.
 */
export function cutAlongLine(network: VectorNetwork, a: Vec2, b: Vec2): { network: VectorNetwork; cuts: number } {
  const crossings = lineCrossings(network, a, b);
  if (crossings.length === 0) return { network, cuts: 0 };
  const bySegment = new Map<number, number[]>();
  for (const c of crossings) bySegment.set(c.segment, [...(bySegment.get(c.segment) ?? []), c.t]);
  let result = network;
  const created: number[] = [];
  for (const [segment, ts] of bySegment) {
    // Split from the far end back: the segment keeps its first part, so each earlier parameter is rescaled to it.
    let upper = 1;
    for (const t of [...ts].sort((x, y) => y - x)) {
      const split = splitSegment(result, segment, t / upper);
      result = split.network;
      created.push(split.vertex);
      upper = t;
    }
  }
  for (const vertex of created) result = cutVertex(result, vertex).network;
  return { network: result, cuts: created.length };
}

/** The network's vertices grouped by the segments joining them, each group in index order, groups ordered by their first vertex. */
export function connectedComponents(network: VectorNetwork): number[][] {
  const parent = network.vertices.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (const s of network.segments) {
    const [x, y] = [find(s.start), find(s.end)];
    if (x !== y) parent[Math.max(x, y)] = Math.min(x, y);
  }
  const groups = new Map<number, number[]>();
  network.vertices.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  });
  return [...groups.values()];
}

/**
 * The network's separate pieces, as networks of their own: one per group of joined vertices that has
 * segments, in the order of `connectedComponents`, keeping each region whose loops all lie in the piece.
 */
export function splitComponents(network: VectorNetwork): VectorNetwork[] {
  return connectedComponents(network).flatMap((group) => {
    const vertexIndex = new Map(group.map((v, i) => [v, i]));
    const segmentIndex = new Map<number, number>();
    const segments: VectorSegment[] = [];
    network.segments.forEach((s, i) => {
      if (!vertexIndex.has(s.start)) return;
      segmentIndex.set(i, segments.length);
      segments.push({ ...s, start: vertexIndex.get(s.start)!, end: vertexIndex.get(s.end)! });
    });
    if (segments.length === 0) return [];
    const regions = network.regions
      .filter((r) => r.loops.every((loop) => loop.every((i) => segmentIndex.has(i))))
      .map((r) => ({ ...r, loops: r.loops.map((loop) => loop.map((i) => segmentIndex.get(i)!)) }));
    return [{ vertices: group.map((v) => network.vertices[v]!), segments, regions }];
  });
}
