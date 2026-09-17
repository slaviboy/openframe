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
import type { VectorNetwork } from './vector-network';

const ZERO: Vec2 = { x: 0, y: 0 };
/** Negation without a negative zero, so offsets compare equal to 0. */
const negate = (v: Vec2): Vec2 => ({ x: v.x === 0 ? 0 : -v.x, y: v.y === 0 ? 0 : -v.y });

/** The Pen tool's progress on a vector network. */
export interface PenState {
  readonly network: VectorNetwork;
  /** The vertex the next click connects from; null before the first point and after closing a path. */
  readonly last: number | null;
  /** Control offset leaving `last`, set by dragging while placing it. */
  readonly outgoing: Vec2;
  /** Segments drawn since the current path began, in order. */
  readonly chain: readonly number[];
  /** The vertices of the current path, in order (`chainVertices[i]` starts `chain[i]`). */
  readonly chainVertices: readonly number[];
}

export const EMPTY_NETWORK: VectorNetwork = { vertices: [], segments: [], regions: [] };

/** A Pen session on a network (empty for a new vector layer). */
export const penStart = (network: VectorNetwork = EMPTY_NETWORK): PenState => ({ network, last: null, outgoing: ZERO, chain: [], chainVertices: [] });

/**
 * A Pen session carrying on from a vertex of a path already drawn: the next click connects to it, which is how
 * an open path is picked up and continued.
 */
export const penResume = (network: VectorNetwork, vertex: number): PenState => ({ network, last: vertex, outgoing: ZERO, chain: [], chainVertices: [vertex] });

/** How many segments meet at each vertex, which is what tells an end of a path from the middle of one. */
function degrees(network: VectorNetwork): number[] {
  const out = new Array<number>(network.vertices.length).fill(0);
  for (const segment of network.segments) {
    for (const vertex of [segment.start, segment.end]) if (out[vertex] !== undefined) out[vertex] = out[vertex] + 1;
  }
  return out;
}

/**
 * The end of an open path within `tolerance` of a point: a vertex exactly one segment meets, which is the only
 * kind a path can be carried on from. Null when the point is on no such vertex.
 */
export function openEndAt(network: VectorNetwork, point: Vec2, tolerance: number): number | null {
  const degree = degrees(network);
  let best: number | null = null;
  let bestDistance = tolerance;
  network.vertices.forEach((v, i) => {
    if (degree[i] !== 1) return;
    const d = Math.hypot(v.x - point.x, v.y - point.y);
    if (d <= bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}

/**
 * One Pen click. It adds a point at `point`, or uses the `existing` vertex under the pointer, and
 * connects it to the previous point. `handle` is how far the pointer was dragged while placing the
 * point: it becomes the point's outgoing control, and its mirror the incoming one, so the segment
 * curves smoothly through the point. Clicking a point of the current path closes it into a region
 * that can be filled and ends the path; clicking a point of another path joins it and continues.
 */
export function penClick(state: PenState, point: Vec2, handle: Vec2 = ZERO, existing: number | null = null): PenState {
  const vertices = [...state.network.vertices];
  const segments = [...state.network.segments];
  const regions = [...state.network.regions];
  const target = existing ?? vertices.push({ x: point.x, y: point.y }) - 1;
  if (state.last === null) {
    return { network: { vertices, segments, regions }, last: target, outgoing: handle, chain: [], chainVertices: [target] };
  }
  if (target === state.last) return state;
  const index = segments.push({ start: state.last, end: target, tangentStart: state.outgoing, tangentEnd: negate(handle) }) - 1;
  const chain = [...state.chain, index];
  const at = existing === null ? -1 : state.chainVertices.indexOf(target);
  if (at !== -1) {
    regions.push({ loops: [chain.slice(at)], windingRule: 'NONZERO' });
    return { network: { vertices, segments, regions }, last: null, outgoing: ZERO, chain: [], chainVertices: [] };
  }
  return { network: { vertices, segments, regions }, last: target, outgoing: handle, chain, chainVertices: [...state.chainVertices, target] };
}

/** The vertex within `tolerance` of a point (the nearest), or null. */
export function vertexAt(network: VectorNetwork, point: Vec2, tolerance: number): number | null {
  let best: number | null = null;
  let bestDistance = tolerance;
  network.vertices.forEach((v, i) => {
    const d = Math.hypot(v.x - point.x, v.y - point.y);
    if (d <= bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}
