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

import type { PathCommand } from '../geometry/corners';
import { distanceToSegment } from '../geometry/shapes';
import type { Vec2 } from '../math/vec';
import { mergeNetworks } from './flatten';
import { commandsToNetwork } from './shape-networks';
import { deleteVertices, segmentPoint } from './vector-edit';
import type { VectorNetwork, VectorSegment } from './vector-network';

type Cubic = readonly [Vec2, Vec2, Vec2, Vec2];

const ZERO: Vec2 = { x: 0, y: 0 };
const SAMPLES = 64;
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const isStraight = (s: VectorSegment) => s.tangentStart.x === 0 && s.tangentStart.y === 0 && s.tangentEnd.x === 0 && s.tangentEnd.y === 0;

/** Distance from a point to the eraser's path; a path of one point is where the eraser was pressed without moving. */
export function distanceToPath(p: Vec2, path: readonly Vec2[]): number {
  if (path.length === 1) return Math.hypot(p.x - path[0]!.x, p.y - path[0]!.y);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, distanceToSegment(p, path[i - 1]!, path[i]!));
  return best;
}

/** A cubic split at `t` (de Casteljau) into the parts before and after it. */
function splitCubic([p0, p1, p2, p3]: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const m = lerp(d, e, t);
  return [
    [p0, a, d, m],
    [m, e, c, p3],
  ];
}

/** The part of a cubic between parameters `t0` and `t1`. */
export function subCubic(curve: Cubic, t0: number, t1: number): Cubic {
  const [head] = splitCubic(curve, t1);
  return t1 === 0 ? head : splitCubic(head, t0 / t1)[1];
}

/**
 * Eraser on open paths: every segment that bounds no region loses the stretches that pass within
 * `weight / 2` of the eraser's `path`. A segment is split where it enters and leaves the erased area
 * (found by sampling, then bisection), each remaining stretch keeping the shape of the curve; points
 * left without segments by the erasing are removed. Region outlines are left to the engine.
 */
export function eraseOpenSegments(network: VectorNetwork, path: readonly Vec2[], weight: number): VectorNetwork {
  if (path.length === 0 || weight <= 0) return network;
  const radius = weight / 2;
  const inLoop = new Set(network.regions.flatMap((r) => r.loops.flat()));
  const vertices = [...network.vertices];
  const added: VectorSegment[] = [];
  const erased = new Set<number>();
  network.segments.forEach((s, i) => {
    if (inLoop.has(i)) return;
    const inside = (t: number) => distanceToPath(segmentPoint(network, i, t), path) <= radius;
    const flags = Array.from({ length: SAMPLES + 1 }, (_, k) => inside(k / SAMPLES));
    if (!flags.some(Boolean)) return;
    erased.add(i);
    // Where the segment crosses the edge of the erased area between two samples.
    const edge = (lo: number, hi: number) => {
      const loInside = inside(lo);
      for (let n = 0; n < 30; n++) {
        const mid = (lo + hi) / 2;
        if (inside(mid) === loInside) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const outside: [number, number][] = [];
    let from: number | null = flags[0] ? null : 0;
    for (let k = 1; k <= SAMPLES; k++) {
      if (flags[k] === flags[k - 1]) continue;
      const t = edge((k - 1) / SAMPLES, k / SAMPLES);
      if (flags[k]) {
        if (from !== null) outside.push([from, t]);
        from = null;
      } else {
        from = t;
      }
    }
    if (from !== null) outside.push([from, 1]);
    const p0 = network.vertices[s.start]!;
    const p3 = network.vertices[s.end]!;
    const curve: Cubic = [p0, { x: p0.x + s.tangentStart.x, y: p0.y + s.tangentStart.y }, { x: p3.x + s.tangentEnd.x, y: p3.y + s.tangentEnd.y }, p3];
    const straight = isStraight(s);
    for (const [t0, t1] of outside) {
      const [a, b, c, d] = subCubic(curve, t0, t1);
      const start = t0 === 0 ? s.start : vertices.push({ x: a.x, y: a.y }) - 1;
      const end = t1 === 1 ? s.end : vertices.push({ x: d.x, y: d.y }) - 1;
      added.push({ start, end, tangentStart: straight ? ZERO : { x: b.x - a.x, y: b.y - a.y }, tangentEnd: straight ? ZERO : { x: c.x - d.x, y: c.y - d.y } });
    }
  });
  if (erased.size === 0) return network;
  return withoutSegments({ vertices, segments: [...network.segments, ...added], regions: network.regions }, erased);
}

/** The network without some segments: region loops are re-pointed, and points left without segments removed. */
function withoutSegments(network: VectorNetwork, removed: ReadonlySet<number>): VectorNetwork {
  const index = new Map<number, number>();
  const segments: VectorSegment[] = [];
  network.segments.forEach((s, i) => {
    if (removed.has(i)) return;
    index.set(i, segments.length);
    segments.push(s);
  });
  const regions = network.regions.map((r) => ({ ...r, loops: r.loops.map((loop) => loop.map((i) => index.get(i)!)) }));
  const used = new Set(segments.flatMap((s) => [s.start, s.end]));
  const ends = new Set([...removed].flatMap((i) => [network.segments[i]!.start, network.segments[i]!.end]));
  return deleteVertices({ vertices: network.vertices, segments, regions }, [...ends].filter((v) => !used.has(v)));
}

/** What is left of a region after a round eraser stroke, as path commands: [] when nothing is left, null when the stroke misses it. */
export type RegionEraser = (network: VectorNetwork, region: number, path: readonly Vec2[], weight: number) => PathCommand[] | null;

/**
 * The Eraser (⇧E): open paths are clipped by `eraseOpenSegments`, and each closed region the stroke
 * reaches is rebuilt from what is left of its area (`minusStroke`, the engine's path operations): its
 * old outline goes, and the edges of the remaining area become new points and segments that keep the
 * region's own fills. Returns the network unchanged when nothing was erased.
 */
export function eraseNetwork(network: VectorNetwork, path: readonly Vec2[], weight: number, minusStroke: RegionEraser): VectorNetwork {
  const clipped = eraseOpenSegments(network, path, weight);
  const touched = clipped.regions.flatMap((_, index) => {
    const commands = minusStroke(clipped, index, path, weight);
    return commands ? [{ index, commands }] : [];
  });
  if (touched.length === 0) return clipped;
  const isTouched = new Set(touched.map((t) => t.index));
  const regions = clipped.regions.filter((_, i) => !isTouched.has(i));
  const stillUsed = new Set(regions.flatMap((r) => r.loops.flat()));
  const outlines = new Set(clipped.regions.flatMap((r, i) => (isTouched.has(i) ? r.loops.flat() : [])).filter((s) => !stillUsed.has(s)));
  const rebuilt = touched.map(({ index, commands }) => {
    const piece = commandsToNetwork(commands);
    const fills = clipped.regions[index]!.fills;
    return fills ? { ...piece, regions: piece.regions.map((r) => ({ ...r, fills })) } : piece;
  });
  return mergeNetworks([withoutSegments({ ...clipped, regions }, outlines), ...rebuilt]);
}
