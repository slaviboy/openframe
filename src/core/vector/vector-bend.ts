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

/** One end of a segment: the vertex it starts at, or the one it ends at. */
export interface SegmentEnd {
  readonly segment: number;
  readonly side: 'start' | 'end';
}

/** A Bézier handle at a vertex: the control point of one segment end, in the network's space. */
export interface VertexHandle {
  readonly end: SegmentEnd;
  readonly vertex: number;
  readonly point: Vec2;
}

/** Every segment end at a vertex, in segment order; a segment that starts and ends there counts twice. */
export function vertexEnds(network: VectorNetwork, vertex: number): SegmentEnd[] {
  const ends: SegmentEnd[] = [];
  network.segments.forEach((s, i) => {
    if (s.start === vertex) ends.push({ segment: i, side: 'start' });
    if (s.end === vertex) ends.push({ segment: i, side: 'end' });
  });
  return ends;
}

/** The vertex at a segment end. */
export const endVertex = (network: VectorNetwork, end: SegmentEnd): number => {
  const s = network.segments[end.segment]!;
  return end.side === 'start' ? s.start : s.end;
};

/** The tangent at a segment end: its handle's offset from the vertex. */
export function tangentAt(network: VectorNetwork, end: SegmentEnd): Vec2 {
  const s = network.segments[end.segment]!;
  return end.side === 'start' ? s.tangentStart : s.tangentEnd;
}

/** The network with one segment end's tangent replaced. */
export function setTangent(network: VectorNetwork, end: SegmentEnd, tangent: Vec2): VectorNetwork {
  const segments = [...network.segments];
  const s = segments[end.segment]!;
  const t = { x: tangent.x, y: tangent.y };
  segments[end.segment] = end.side === 'start' ? { ...s, tangentStart: t } : { ...s, tangentEnd: t };
  return { ...network, segments };
}

/** The other segment end at the same vertex, when exactly two meet there (a path passing through the point). */
export function oppositeEnd(network: VectorNetwork, end: SegmentEnd): SegmentEnd | null {
  const ends = vertexEnds(network, endVertex(network, end));
  if (ends.length !== 2) return null;
  return ends.find((e) => e.segment !== end.segment || e.side !== end.side) ?? null;
}

/**
 * Bend: gives a vertex mirrored handles so the path curves smoothly through it. The segment end leaving
 * the vertex takes `handle` (the first end when both leave or both arrive) and the other end its
 * opposite; an endpoint's one segment curves toward `handle` as it arrives or leaves. Junctions of more
 * than two ends bend their first two.
 */
export function bendVertex(network: VectorNetwork, vertex: number, handle: Vec2): VectorNetwork {
  const ends = vertexEnds(network, vertex);
  // 0 − x keeps a zero component +0 (−0 would be stored in the document).
  const opposite = { x: 0 - handle.x, y: 0 - handle.y };
  const [a, b] = ends;
  if (!a) return network;
  if (!b) return setTangent(network, a, a.side === 'start' ? handle : opposite);
  const [leaving, other] = a.side === b.side || a.side === 'start' ? [a, b] : [b, a];
  return setTangent(setTangent(network, leaving, handle), other, opposite);
}

/** The handles at the given vertices: every segment end there whose tangent isn't zero. */
export function vertexHandles(network: VectorNetwork, vertices: readonly number[]): VertexHandle[] {
  return [...new Set(vertices)].flatMap((vertex) => {
    const p = network.vertices[vertex];
    if (!p) return [];
    return vertexEnds(network, vertex).flatMap((end) => {
      const t = tangentAt(network, end);
      return t.x === 0 && t.y === 0 ? [] : [{ end, vertex, point: { x: p.x + t.x, y: p.y + t.y } }];
    });
  });
}
