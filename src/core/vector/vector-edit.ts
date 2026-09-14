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
 * Cut (X): breaks the path at a vertex. Each segment end there except the first gets its own copy of the
 * vertex, so the segments no longer connect; regions whose loops used those segments lose their fill.
 * Returns the network and the vertices at the cut (the vertex and its copies).
 */
export function cutVertex(network: VectorNetwork, vertex: number): { network: VectorNetwork; vertices: number[] } {
  const ends: { segment: number; side: 'start' | 'end' }[] = [];
  network.segments.forEach((s, i) => {
    if (s.start === vertex) ends.push({ segment: i, side: 'start' });
    if (s.end === vertex) ends.push({ segment: i, side: 'end' });
  });
  if (ends.length < 2) return { network, vertices: [vertex] };
  const vertices = [...network.vertices];
  const segments = [...network.segments];
  const created = [vertex];
  for (const { segment, side } of ends.slice(1)) {
    const copy = vertices.push({ ...network.vertices[vertex]! }) - 1;
    created.push(copy);
    const s = segments[segment]!;
    segments[segment] = side === 'start' ? { ...s, start: copy } : { ...s, end: copy };
  }
  const cut = new Set(ends.map((e) => e.segment));
  const regions = network.regions.flatMap((region) => {
    const loops = region.loops.filter((loop) => !loop.some((i) => cut.has(i)));
    return loops.length > 0 ? [{ ...region, loops }] : [];
  });
  return { network: { vertices, segments, regions }, vertices: created };
}

/** A segment traced from its end to its start. */
const reversed = (s: VectorSegment): VectorSegment => ({ start: s.end, end: s.start, tangentStart: s.tangentEnd, tangentEnd: s.tangentStart });

/**
 * Delete and heal (⇧Delete): removes vertices and joins the path across each one. The two segments of
 * a vertex joining exactly two become one segment between their far ends that keeps the outer handle
 * directions, lengthened in proportion to the joined length; region loops keep the joined segment.
 * Other vertices (endpoints, junctions) are deleted with their segments, as `deleteVertices` does.
 */
export function healVertices(network: VectorNetwork, indices: readonly number[]): VectorNetwork {
  let result = network;
  // From the highest index down, so the indices still to process are unchanged by each removal.
  for (const v of [...new Set(indices)].sort((a, b) => b - a)) {
    const touching = result.segments.flatMap((s, i) => (s.start === v || s.end === v ? [i] : []));
    const [a, b] = touching;
    if (touching.length !== 2 || a === undefined || b === undefined) {
      result = deleteVertices(result, [v]);
      continue;
    }
    // Orient the first segment to end at the vertex and the second to start there.
    const first = result.segments[a]!.end === v ? result.segments[a]! : reversed(result.segments[a]!);
    const second = result.segments[b]!.start === v ? result.segments[b]! : reversed(result.segments[b]!);
    if (first.start === v || second.end === v || first.start === second.end) {
      result = deleteVertices(result, [v]);
      continue;
    }
    const [p, m, q] = [result.vertices[first.start]!, result.vertices[v]!, result.vertices[second.end]!];
    const lengthA = Math.hypot(m.x - p.x, m.y - p.y);
    const lengthB = Math.hypot(q.x - m.x, q.y - m.y);
    const total = lengthA + lengthB;
    const scale = (t: Vec2, length: number): Vec2 => (length > 0 ? { x: (t.x * total) / length, y: (t.y * total) / length } : t);
    const joined: VectorSegment = { start: first.start, end: second.end, tangentStart: scale(first.tangentStart, lengthA), tangentEnd: scale(second.tangentEnd, lengthB) };
    const segments = [...result.segments];
    segments[a] = joined;
    const regions = result.regions.map((region) => ({ ...region, loops: region.loops.map((loop) => loop.filter((i) => i !== b)) }));
    // The vertex now touches only the second segment, which deleteVertices removes (renumbering the rest).
    result = deleteVertices({ vertices: result.vertices, segments, regions }, [v]);
  }
  return result;
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
