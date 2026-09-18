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

import type { HandleMirroring, Paint } from '../schema/document';
import { roundNetworkCorners } from './vector-corners';
import { flattenPath, type PathCommand } from '../geometry/corners';
import { apply, applyLinear, type Matrix } from '../math/matrix';
import type { Rect } from '../math/rect';
import type { Vec2 } from '../math/vec';

/**
 * A vector network: points (vertices) joined by straight or curved segments in any direction,
 * branching freely, with optional closed regions that can be filled. Segment tangents are offsets
 * of the Bézier control points from their segment's start and end vertices; zero tangents make a
 * straight segment. Coordinates are in the layer's local space.
 */
export interface VectorVertex {
  readonly x: number;
  readonly y: number;
  /** How the point's two handles follow each other while one is dragged; absent means exact opposites. */
  readonly mirror?: HandleMirroring | undefined;
  /**
   * How far the corner at this point is rounded, in the layer's own units. Kept on the point, so the file
   * holds the sharp corner and its radius; the geometry is drawn with the corner rounded in.
   */
  readonly cornerRadius?: number | undefined;
}

export interface VectorSegment {
  readonly start: number;
  readonly end: number;
  readonly tangentStart: Vec2;
  readonly tangentEnd: Vec2;
}

export interface VectorRegion {
  /** Closed loops, each a list of segment indices in order around the loop. */
  readonly loops: readonly (readonly number[])[];
  readonly windingRule: 'NONZERO' | 'EVENODD';
  /** The region's own fills (Paint tool), replacing the layer's fills inside it; absent means the layer's. */
  readonly fills?: readonly Paint[] | undefined;
}

export interface VectorNetwork {
  readonly vertices: readonly VectorVertex[];
  readonly segments: readonly VectorSegment[];
  readonly regions: readonly VectorRegion[];
}

const ZERO: Vec2 = { x: 0, y: 0 };
const isStraight = (s: VectorSegment) => s.tangentStart.x === 0 && s.tangentStart.y === 0 && s.tangentEnd.x === 0 && s.tangentEnd.y === 0;

/** A straight segment between two vertices. */
export const straightSegment = (start: number, end: number): VectorSegment => ({ start, end, tangentStart: ZERO, tangentEnd: ZERO });

/** Draws one segment from `from` (its start or end vertex) to the other end. */
function segmentCommand(network: VectorNetwork, segment: VectorSegment, reversed: boolean): PathCommand {
  const a = network.vertices[segment.start]!;
  const b = network.vertices[segment.end]!;
  const [to, c1, c2] = reversed
    ? [a, { x: b.x + segment.tangentEnd.x, y: b.y + segment.tangentEnd.y }, { x: a.x + segment.tangentStart.x, y: a.y + segment.tangentStart.y }]
    : [b, { x: a.x + segment.tangentStart.x, y: a.y + segment.tangentStart.y }, { x: b.x + segment.tangentEnd.x, y: b.y + segment.tangentEnd.y }];
  return isStraight(segment) ? { op: 'L', x: to.x, y: to.y } : { op: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: to.x, y: to.y };
}

/**
 * The stroke path of a network: every segment once, chained into as few subpaths as possible by
 * continuing from the end vertex while it has an unused segment; a chain that returns to its first
 * vertex is closed.
 */
export function networkStrokePath(source: VectorNetwork): PathCommand[] {
  // Points that carry a corner radius are rounded in first, so every reader of the path — the renderer,
  // hit-testing, export, outlining, the width tool — sees the shape as it is drawn.
  const network = roundNetworkCorners(source);
  const used = new Array<boolean>(network.segments.length).fill(false);
  const commands: PathCommand[] = [];
  const next = (vertex: number) => network.segments.findIndex((s, i) => !used[i] && (s.start === vertex || s.end === vertex));
  // Start chains at vertices with an odd number of segments (open ends) so open paths draw in one piece.
  const degree = network.vertices.map((_, v) => network.segments.filter((s) => s.start === v || s.end === v).length);
  const order = [...network.segments.keys()].sort((a, b) => (degree[network.segments[b]!.start]! % 2) - (degree[network.segments[a]!.start]! % 2));
  for (const first of order) {
    if (used[first]) continue;
    const firstSegment = network.segments[first]!;
    const origin = degree[firstSegment.start]! % 2 === 1 || degree[firstSegment.end]! % 2 === 0 ? firstSegment.start : firstSegment.end;
    const start = network.vertices[origin]!;
    commands.push({ op: 'M', x: start.x, y: start.y });
    let vertex = origin;
    for (let index = first; index !== -1; index = next(vertex)) {
      const segment = network.segments[index]!;
      used[index] = true;
      const reversed = segment.end === vertex && segment.start !== vertex;
      commands.push(segmentCommand(network, segment, reversed));
      vertex = reversed ? segment.start : segment.end;
      if (vertex === origin) {
        commands.push({ op: 'Z' });
        break;
      }
    }
  }
  return commands;
}

/**
 * The fill path of one region: each loop walked through its segments and closed. The region must be one of
 * the network's own, so that rounding the points' corners can carry it along; a region from anywhere else
 * is drawn against the network as it stands.
 */
export function regionFillPath(source: VectorNetwork, region: VectorRegion): PathCommand[] {
  const index = source.regions.indexOf(region);
  const network = index >= 0 ? roundNetworkCorners(source) : source;
  const rounded = index >= 0 ? network.regions[index]! : region;
  const commands: PathCommand[] = [];
  for (const loop of rounded.loops) {
    if (loop.length === 0) continue;
    const segments = loop.map((i) => network.segments[i]!);
    // The loop starts at the vertex the first segment doesn't share with the second.
    const [first, second] = segments;
    let vertex = second && (first!.end === second.start || first!.end === second.end) ? first!.start : first!.end;
    const start = network.vertices[vertex]!;
    commands.push({ op: 'M', x: start.x, y: start.y });
    for (const segment of segments) {
      const reversed = segment.end === vertex && segment.start !== vertex;
      commands.push(segmentCommand(network, segment, reversed));
      vertex = reversed ? segment.start : segment.end;
    }
    commands.push({ op: 'Z' });
  }
  return commands;
}

/** Parameters in (0, 1) where one coordinate of a cubic Bézier has a local extremum. */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const d = b * b - 4 * a * c;
    if (d >= 0) {
      const s = Math.sqrt(d);
      roots.push((-b + s) / (2 * a), (-b - s) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

const cubicAt = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/**
 * The tight bounds of a network's geometry (vertices and curve extrema, not control points); null when
 * empty. Rounded corners are measured as they are drawn, so the layer's box hugs the shape rather than the
 * sharp corner it was cut from.
 */
export function networkBounds(source: VectorNetwork): Rect | null {
  const network = roundNetworkCorners(source);
  if (network.vertices.length === 0) return null;
  const xs = network.vertices.map((v) => v.x);
  const ys = network.vertices.map((v) => v.y);
  for (const s of network.segments) {
    if (isStraight(s)) continue;
    const a = network.vertices[s.start]!;
    const b = network.vertices[s.end]!;
    const c1 = { x: a.x + s.tangentStart.x, y: a.y + s.tangentStart.y };
    const c2 = { x: b.x + s.tangentEnd.x, y: b.y + s.tangentEnd.y };
    for (const t of cubicExtrema(a.x, c1.x, c2.x, b.x)) xs.push(cubicAt(a.x, c1.x, c2.x, b.x, t));
    for (const t of cubicExtrema(a.y, c1.y, c2.y, b.y)) ys.push(cubicAt(a.y, c1.y, c2.y, b.y, t));
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Moves and scales a network: `origin` maps to (0, 0), then coordinates and tangents scale by `sx`, `sy`. */
export function transformNetwork(network: VectorNetwork, origin: Vec2, sx: number, sy: number): VectorNetwork {
  return {
    vertices: network.vertices.map((v) => ({ ...v, x: (v.x - origin.x) * sx, y: (v.y - origin.y) * sy })),
    segments: network.segments.map((s) => ({ ...s, tangentStart: { x: s.tangentStart.x * sx, y: s.tangentStart.y * sy }, tangentEnd: { x: s.tangentEnd.x * sx, y: s.tangentEnd.y * sy } })),
    regions: network.regions,
  };
}

/** Splits path commands into subpaths, each starting with its move. */
function subpaths(commands: readonly PathCommand[]): PathCommand[][] {
  const out: PathCommand[][] = [];
  for (const command of commands) {
    if (command.op === 'M' || out.length === 0) out.push([]);
    out.at(-1)!.push(command);
  }
  return out;
}

/** Each region's loops flattened into polygons, in region order. */
export function regionOutlines(network: VectorNetwork, segmentsPerCurve = 8): Vec2[][][] {
  return network.regions.map((region) => subpaths(regionFillPath(network, region)).map((sub) => flattenPath(sub, segmentsPerCurve)));
}

/** Flattened outlines for hit testing: each region loop as a polygon, and each stroke subpath as a polyline. */
export function networkOutlines(network: VectorNetwork, segmentsPerCurve = 8): { fills: Vec2[][]; strokes: { points: Vec2[]; closed: boolean }[] } {
  const fills = regionOutlines(network, segmentsPerCurve).flat();
  const strokes = subpaths(networkStrokePath(network)).map((sub) => ({ points: flattenPath(sub, segmentsPerCurve), closed: sub.at(-1)?.op === 'Z' }));
  return { fills, strokes };
}

/** Applies an affine transform to a network: vertices move with the whole matrix, tangents with its linear part. */
export function transformNetworkBy(network: VectorNetwork, m: Matrix): VectorNetwork {
  return {
    vertices: network.vertices.map((v) => ({ ...v, ...apply(m, v) })),
    segments: network.segments.map((s) => ({ ...s, tangentStart: applyLinear(m, s.tangentStart), tangentEnd: applyLinear(m, s.tangentEnd) })),
    regions: network.regions,
  };
}
