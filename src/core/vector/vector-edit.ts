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
import type { VectorNetwork, VectorSegment } from './vector-network';

const ZERO: Vec2 = { x: 0, y: 0 };
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const isStraight = (s: VectorSegment) => s.tangentStart.x === 0 && s.tangentStart.y === 0 && s.tangentEnd.x === 0 && s.tangentEnd.y === 0;

/** A segment's four Bézier points. */
function controlPoints(network: VectorNetwork, s: VectorSegment): [Vec2, Vec2, Vec2, Vec2] {
  const p0 = network.vertices[s.start]!;
  const p3 = network.vertices[s.end]!;
  return [p0, { x: p0.x + s.tangentStart.x, y: p0.y + s.tangentStart.y }, { x: p3.x + s.tangentEnd.x, y: p3.y + s.tangentEnd.y }, p3];
}

/** The point at parameter `t` of a segment. */
export function segmentPoint(network: VectorNetwork, segment: number, t: number): Vec2 {
  const [p0, p1, p2, p3] = controlPoints(network, network.segments[segment]!);
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

/** Moves vertices by `delta`. Tangents are offsets, so the curves on either side keep their handles. */
export function moveVertices(network: VectorNetwork, indices: readonly number[], delta: Vec2): VectorNetwork {
  const moving = new Set(indices);
  return { ...network, vertices: network.vertices.map((v, i) => (moving.has(i) ? { ...v, x: v.x + delta.x, y: v.y + delta.y } : v)) };
}

/**
 * Deletes vertices together with every segment that touches them. A region loses any loop that used
 * a deleted segment (and disappears without loops); vertex and segment indices are renumbered.
 */
export function deleteVertices(network: VectorNetwork, indices: readonly number[]): VectorNetwork {
  const removed = new Set(indices);
  const vertexIndex = new Map<number, number>();
  network.vertices.forEach((_, i) => {
    if (!removed.has(i)) vertexIndex.set(i, vertexIndex.size);
  });
  const segmentIndex = new Map<number, number>();
  const segments: VectorSegment[] = [];
  network.segments.forEach((s, i) => {
    if (removed.has(s.start) || removed.has(s.end)) return;
    segmentIndex.set(i, segments.length);
    segments.push({ ...s, start: vertexIndex.get(s.start)!, end: vertexIndex.get(s.end)! });
  });
  const regions = network.regions.flatMap((region) => {
    const loops = region.loops.filter((loop) => loop.every((i) => segmentIndex.has(i))).map((loop) => loop.map((i) => segmentIndex.get(i)!));
    return loops.length > 0 ? [{ ...region, loops }] : [];
  });
  return { vertices: network.vertices.filter((_, i) => !removed.has(i)), segments, regions };
}

/**
 * Adds a vertex on a segment at parameter `t` (0–1), splitting it into two segments that trace the
 * same curve (de Casteljau). Region loops that used the segment use both halves, in the direction the
 * loop travels. Returns the new network and the new vertex's index.
 */
export function splitSegment(network: VectorNetwork, segment: number, t: number): { network: VectorNetwork; vertex: number } {
  const s = network.segments[segment]!;
  const [p0, p1, p2, p3] = controlPoints(network, s);
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const m = lerp(d, e, t);
  const vertex = network.vertices.length;
  const straight = isStraight(s);
  const first: VectorSegment = { start: s.start, end: vertex, tangentStart: straight ? ZERO : { x: a.x - p0.x, y: a.y - p0.y }, tangentEnd: straight ? ZERO : { x: d.x - m.x, y: d.y - m.y } };
  const second: VectorSegment = { start: vertex, end: s.end, tangentStart: straight ? ZERO : { x: e.x - m.x, y: e.y - m.y }, tangentEnd: straight ? ZERO : { x: c.x - p3.x, y: c.y - p3.y } };
  const segments = [...network.segments];
  segments[segment] = first;
  const secondIndex = segments.push(second) - 1;
  const regions = network.regions.map((region) => ({
    ...region,
    loops: region.loops.map((loop) =>
      loop.flatMap((i, k) => {
        if (i !== segment) return [i];
        // The loop travels this segment forward when the previous segment ends at its start.
        const previous = network.segments[loop[(k - 1 + loop.length) % loop.length]!]!;
        const forward = loop.length === 1 || previous.start === s.start || previous.end === s.start;
        return forward ? [segment, secondIndex] : [secondIndex, segment];
      }),
    ),
  }));
  return { network: { vertices: [...network.vertices, { x: m.x, y: m.y }], segments, regions }, vertex };
}

/** The point on the network's segments nearest to `point`: its segment, parameter and distance; null without segments. */
export function nearestOnSegments(network: VectorNetwork, point: Vec2, samples = 32): { segment: number; t: number; distance: number } | null {
  let best: { segment: number; t: number; distance: number } | null = null;
  const distanceAt = (segment: number, t: number) => {
    const q = segmentPoint(network, segment, t);
    return Math.hypot(q.x - point.x, q.y - point.y);
  };
  network.segments.forEach((_, segment) => {
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const distance = distanceAt(segment, t);
      if (!best || distance < best.distance) best = { segment, t, distance };
    }
  });
  if (!best) return null;
  // Refine around the best sample with a ternary search.
  const found: { segment: number; t: number; distance: number } = best;
  let lo = Math.max(0, found.t - 1 / samples);
  let hi = Math.min(1, found.t + 1 / samples);
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (distanceAt(found.segment, m1) < distanceAt(found.segment, m2)) hi = m2;
    else lo = m1;
  }
  const t = (lo + hi) / 2;
  const distance = distanceAt(found.segment, t);
  return distance < found.distance ? { segment: found.segment, t, distance } : found;
}
