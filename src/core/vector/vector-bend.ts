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
import type { HandleMirroring } from '../schema/document';
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

/** What a point's mirroring comes to when it carries none of its own: handles the Bend tool made are exact opposites. */
export function mirroringOf(network: VectorNetwork, vertex: number): HandleMirroring {
  const stored = network.vertices[vertex]?.mirror;
  if (stored) return stored;
  const ends = vertexEnds(network, vertex);
  const [a, b] = ends;
  if (!a || !b) return 'NONE';
  const [t, o] = [tangentAt(network, a), tangentAt(network, b)];
  const opposite = Math.abs(t.x + o.x) < 1e-6 && Math.abs(t.y + o.y) < 1e-6;
  const drawn = t.x !== 0 || t.y !== 0 || o.x !== 0 || o.y !== 0;
  return opposite && drawn ? 'ANGLE_AND_LENGTH' : 'NONE';
}

/**
 * The tangent the handle opposite a dragged one takes: nothing under no mirroring, the opposite direction at its
 * own length under mirrored angle, and the exact opposite under mirrored angle and length.
 */
export function mirroredTangent(mode: HandleMirroring, dragged: Vec2, other: Vec2): Vec2 | null {
  if (mode === 'NONE') return null;
  if (mode === 'ANGLE_AND_LENGTH') return { x: 0 - dragged.x, y: 0 - dragged.y };
  const length = Math.hypot(other.x, other.y);
  const reach = Math.hypot(dragged.x, dragged.y);
  // A handle dragged onto its point has no direction to mirror, so the other one stays where it is.
  if (reach === 0 || length === 0) return other;
  return { x: (0 - dragged.x / reach) * length, y: (0 - dragged.y / reach) * length };
}

/** The network with a mirroring set on the given points; `undefined` puts them back to being read from the handles. */
export function setMirroring(network: VectorNetwork, vertices: readonly number[], mode: HandleMirroring | undefined): VectorNetwork {
  const wanted = new Set(vertices);
  return {
    ...network,
    vertices: network.vertices.map((vertex, i) => {
      if (!wanted.has(i)) return vertex;
      const { mirror: _mirror, ...rest } = vertex;
      return mode === undefined ? rest : { ...rest, mirror: mode };
    }),
  };
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

/**
 * Moves several handles together (Shift-selected handles, dragged as one): each segment end's tangent is
 * offset by the same `delta`, so every handle copies the movement. Each end moves once.
 */
export function moveHandles(network: VectorNetwork, ends: readonly SegmentEnd[], delta: Vec2): VectorNetwork {
  const seen = new Set<string>();
  let result = network;
  for (const end of ends) {
    const key = `${end.segment}:${end.side}`;
    if (seen.has(key) || !result.segments[end.segment]) continue;
    seen.add(key);
    const t = tangentAt(result, end);
    result = setTangent(result, end, { x: t.x + delta.x, y: t.y + delta.y });
  }
  return result;
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
