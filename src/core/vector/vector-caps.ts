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

import type { StrokeCap } from '../schema/document';
import type { Vec2 } from '../math/vec';
import type { VectorNetwork, VectorVertex } from './vector-network';

/** An open end of a path: the point it stops at, and the direction it points away from the path in. */
export interface OpenEnd {
  /** The vertex the path ends at. */
  readonly vertex: number;
  readonly point: Vec2;
  /** The outward direction, in radians: where an arrowhead at this end points. */
  readonly angle: number;
}

/** Caps that are drawn as their own artwork at the end, rather than being the stroke's own cap. */
export const isMarkerCap = (cap: StrokeCap): boolean => cap !== 'NONE' && cap !== 'ROUND' && cap !== 'SQUARE';

/** The cap an open end is drawn with: its own, or the layer's default for the ends that carry none. */
export const capOfEnd = (vertex: VectorVertex | undefined, fallback: StrokeCap | undefined): StrokeCap => vertex?.cap ?? fallback ?? 'NONE';

/** How many segments meet at each vertex. */
function degrees(network: VectorNetwork): number[] {
  const degree = network.vertices.map(() => 0);
  for (const s of network.segments) {
    if (degree[s.start] !== undefined) degree[s.start]! += 1;
    if (degree[s.end] !== undefined) degree[s.end]! += 1;
  }
  return degree;
}

/** The outward direction at an open end, from the segment that reaches it: away from its handle, or from the point it came from. */
function outwardAngle(network: VectorNetwork, vertex: number): number {
  const index = network.segments.findIndex((s) => s.start === vertex || s.end === vertex);
  const segment = network.segments[index];
  const here = network.vertices[vertex];
  if (!segment || !here) return 0;
  const atStart = segment.start === vertex;
  const tangent = atStart ? segment.tangentStart : segment.tangentEnd;
  const other = network.vertices[atStart ? segment.end : segment.start];
  // The path leaves the end towards its handle, so the end points the opposite way; a straight segment
  // points away from the point at its other end.
  const away = tangent.x !== 0 || tangent.y !== 0 ? { x: -tangent.x, y: -tangent.y } : other ? { x: here.x - other.x, y: here.y - other.y } : { x: 0, y: 0 };
  return away.x === 0 && away.y === 0 ? 0 : Math.atan2(away.y, away.x);
}

/** Every open end of a network — a point only one segment reaches — in vertex order. */
export function openEnds(network: VectorNetwork): OpenEnd[] {
  const degree = degrees(network);
  const ends: OpenEnd[] = [];
  degree.forEach((count, vertex) => {
    const point = network.vertices[vertex];
    if (count !== 1 || !point) return;
    ends.push({ vertex, point: { x: point.x, y: point.y }, angle: outwardAngle(network, vertex) });
  });
  return ends;
}

/**
 * The vertices of a network that is one unbranched path, in the order it is walked; null when it branches
 * or is drawn in more than one piece. An open path starts at an end, which is where its start point goes.
 */
export function chainVertices(network: VectorNetwork): number[] | null {
  if (network.segments.length === 0) return null;
  const degree = degrees(network);
  if (degree.some((count) => count > 2)) return null;
  const ends = degree.map((count, vertex) => ({ count, vertex })).filter((entry) => entry.count === 1);
  if (ends.length > 2) return null;
  // A closed path is walked from its lowest vertex; an open one from the first of its two ends, which is
  // the one the path was drawn from (the Pen lays its points down in order).
  const first = ends[0]?.vertex ?? network.segments[0]!.start;
  const used = new Array<boolean>(network.segments.length).fill(false);
  const walk = [first];
  let vertex = first;
  for (;;) {
    const index = network.segments.findIndex((s, i) => !used[i] && (s.start === vertex || s.end === vertex));
    const segment = network.segments[index];
    if (!segment) break;
    used[index] = true;
    vertex = segment.start === vertex ? segment.end : segment.start;
    if (vertex === first) break;
    walk.push(vertex);
  }
  // Every segment has to belong to the one walk, or the network is drawn in more than one piece.
  return used.every(Boolean) ? walk : null;
}

/** The two ends of a network that is a single open path — the one it starts at first; null for any other network. */
export function pathEnds(network: VectorNetwork): { readonly start: OpenEnd; readonly end: OpenEnd } | null {
  const walk = chainVertices(network);
  const ends = openEnds(network);
  if (!walk || ends.length !== 2) return null;
  const start = ends.find((e) => e.vertex === walk[0]);
  const end = ends.find((e) => e.vertex === walk[walk.length - 1]);
  return start && end && start !== end ? { start, end } : null;
}
