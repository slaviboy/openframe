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
// Types only: `vector-network` reaches back here for the rounding, so nothing may be imported at runtime.
import type { VectorNetwork, VectorSegment, VectorVertex } from './vector-network';

/**
 * A point's corner radius, rounded into the network's own geometry.
 *
 * The documentation puts it plainly: corner radius "rounds the corner where two lines meet", and it is
 * not offered for lines, arrows or a network with only a single stroke. So a point is rounded when it
 * joins exactly two straight segments, and only then; a point with a Bézier on either side stays sharp.
 *
 * The point itself slides back along one edge, a new point appears the same distance along the other, and
 * an arc joins them — so everything downstream (fills, strokes, hit-testing, outlining, export) sees a
 * network like any other, and the file keeps the sharp corner with its radius on it.
 */

/** A rounded corner's geometry, or null when the corner cannot take one. */
interface Corner {
  /** Where the incoming edge now ends. */
  readonly from: Vec2;
  /** Where the outgoing edge now starts. */
  readonly to: Vec2;
  readonly center: Vec2;
  readonly radius: number;
  /** Signed sweep from `from` to `to` about the center, in radians. */
  readonly sweep: number;
}

const isStraight = (s: VectorSegment) => s.tangentStart.x === 0 && s.tangentStart.y === 0 && s.tangentEnd.x === 0 && s.tangentEnd.y === 0;
const other = (s: VectorSegment, v: number) => (s.start === v ? s.end : s.start);

/**
 * The arc that rounds the corner at `v` between the edges running out to `prev` and `next`. The radius is
 * clamped so the arc never takes more than half of either edge, which is what keeps neighbouring corners
 * from eating into each other — the same budget `roundedPolygon` works to.
 */
export function cornerArc(prev: Vec2, v: Vec2, next: Vec2, requested: number): Corner | null {
  if (!(requested > 0)) return null;
  const la = Math.hypot(prev.x - v.x, prev.y - v.y);
  const lb = Math.hypot(next.x - v.x, next.y - v.y);
  if (la === 0 || lb === 0) return null;
  const dirA = { x: (prev.x - v.x) / la, y: (prev.y - v.y) / la };
  const dirB = { x: (next.x - v.x) / lb, y: (next.y - v.y) / lb };
  const theta = Math.acos(Math.min(1, Math.max(-1, dirA.x * dirB.x + dirA.y * dirB.y)));
  // Doubling back on itself, or running straight through: there is no corner to round.
  if (theta < 1e-6 || Math.PI - theta < 1e-6) return null;
  const tanHalf = Math.tan(theta / 2);
  const budget = Math.min(la, lb) / 2;
  const radius = Math.min(requested, budget * tanHalf);
  const tangent = radius / tanHalf;
  const bisector = { x: dirA.x + dirB.x, y: dirA.y + dirB.y };
  const length = Math.hypot(bisector.x, bisector.y);
  if (length === 0) return null;
  const reach = radius / Math.sin(theta / 2);
  const center = { x: v.x + (bisector.x / length) * reach, y: v.y + (bisector.y / length) * reach };
  const from = { x: v.x + dirA.x * tangent, y: v.y + dirA.y * tangent };
  const to = { x: v.x + dirB.x * tangent, y: v.y + dirB.y * tangent };
  // The arc is the short way round: its sweep is the turn the outline makes, π − θ, signed by which way it turns.
  const cross = (from.x - center.x) * (to.y - center.y) - (from.y - center.y) * (to.x - center.x);
  return { from, to, center, radius, sweep: (cross >= 0 ? 1 : -1) * (Math.PI - theta) };
}

/** The arc as vertices and curved segments between them, at most a quarter turn each. */
function arcSegments(corner: Corner, startIndex: number, nextIndex: number): { vertices: Vec2[]; segments: VectorSegment[]; endIndex: number } {
  const { center, radius, sweep } = corner;
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const step = sweep / count;
  const k = (4 / 3) * Math.tan(step / 4);
  const phi0 = Math.atan2(corner.from.y - center.y, corner.from.x - center.x);
  const vertices: Vec2[] = [];
  const segments: VectorSegment[] = [];
  let start = startIndex;
  for (let i = 0; i < count; i++) {
    const a = phi0 + step * i;
    const b = a + step;
    const last = i === count - 1;
    const end = last ? nextIndex : nextIndex + 1 + vertices.length;
    if (!last) vertices.push({ x: center.x + radius * Math.cos(b), y: center.y + radius * Math.sin(b) });
    segments.push({
      start,
      end,
      tangentStart: { x: -k * radius * Math.sin(a), y: k * radius * Math.cos(a) },
      tangentEnd: { x: k * radius * Math.sin(b), y: -k * radius * Math.cos(b) },
    });
    start = end;
  }
  return { vertices, segments, endIndex: nextIndex };
}

/** Whether any point of the network asks for a rounded corner. */
export const hasCornerRadii = (network: VectorNetwork): boolean => network.vertices.some((v) => (v.cornerRadius ?? 0) > 0);

/**
 * Whether a point has a corner that can be rounded: exactly two straight segments meeting at an angle. An
 * end of the path, a junction, or a point with a curve on either side has none — which is the documentation's
 * own list of what corner radius is not offered for.
 */
export function roundableVertex(network: VectorNetwork, v: number): boolean {
  const touching = network.segments.filter((s) => s.start === v || s.end === v);
  const [a, b] = touching;
  if (touching.length !== 2 || !a || !b || !isStraight(a) || !isStraight(b)) return false;
  const prev = network.vertices[other(a, v)];
  const next = network.vertices[other(b, v)];
  const here = network.vertices[v];
  return !!prev && !!next && !!here && cornerArc(prev, here, next, 1) !== null;
}

/**
 * The network with its points' corner radii drawn in. Returns the network itself when no point asks for
 * one, so a file without rounded points costs nothing and behaves exactly as before.
 */
export function roundNetworkCorners(network: VectorNetwork): VectorNetwork {
  if (!hasCornerRadii(network)) return network;

  const vertices: VectorVertex[] = network.vertices.map((v) => {
    const { cornerRadius: _radius, ...rest } = v;
    return rest;
  });
  const segments: VectorSegment[] = network.segments.map((s) => ({ ...s }));
  /** Arc segment indices inserted at a corner, running from the `a` side to the `b` side. */
  const arcs = new Map<number, { a: number; b: number; segments: number[] }>();

  // Every corner is measured against the path as it was drawn, not against edges an earlier corner has
  // already eaten into — so two corners on one edge each take up to half of it and meet in the middle.
  const planned: { v: number; a: number; b: number; corner: Corner }[] = [];
  for (let v = 0; v < network.vertices.length; v++) {
    const requested = network.vertices[v]?.cornerRadius ?? 0;
    if (!(requested > 0)) continue;
    const touching = [...network.segments.keys()].filter((i) => network.segments[i]!.start === v || network.segments[i]!.end === v);
    // Only where two straight lines meet, which is the corner the documentation describes.
    const [a, b] = touching;
    if (touching.length !== 2 || a === undefined || b === undefined) continue;
    if (!isStraight(network.segments[a]!) || !isStraight(network.segments[b]!)) continue;
    const prev = network.vertices[other(network.segments[a]!, v)];
    const next = network.vertices[other(network.segments[b]!, v)];
    if (!prev || !next) continue;
    const corner = cornerArc(prev, network.vertices[v]!, next, requested);
    if (corner) planned.push({ v, a, b, corner });
  }

  for (const { v, a, b, corner } of planned) {
    // The point slides back along the incoming edge and keeps its index; the outgoing edge starts at a new one.
    vertices[v] = { ...vertices[v]!, ...corner.from };
    const toIndex = vertices.length;
    vertices.push({ ...corner.to });
    const arc = arcSegments(corner, v, toIndex);
    vertices.splice(toIndex + 1, 0, ...arc.vertices);
    segments[b] = { ...segments[b]!, ...(segments[b]!.start === v ? { start: toIndex } : { end: toIndex }) };
    const first = segments.length;
    segments.push(...arc.segments);
    arcs.set(v, { a, b, segments: arc.segments.map((_, i) => first + i) });
  }

  if (arcs.size === 0) return network;

  // A loop walks segments in order, so the arc goes in between the two it rounds — the way round it runs
  // depending on which of them the loop reaches first.
  const regions = network.regions.map((region) => ({
    ...region,
    loops: region.loops.map((loop) => {
      const out: number[] = [];
      for (let i = 0; i < loop.length; i++) {
        const current = loop[i]!;
        out.push(current);
        const following = loop[(i + 1) % loop.length]!;
        for (const arc of arcs.values()) {
          if (arc.a === current && arc.b === following) out.push(...arc.segments);
          else if (arc.b === current && arc.a === following) out.push(...[...arc.segments].reverse());
        }
      }
      return out;
    }),
  }));

  return { vertices, segments, regions };
}
