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

import { flattenPath, type PathCommand } from '../geometry/corners';
import type { Vec2 } from '../math/vec';
import { simplifyPolyline } from './pencil';
import { networkStrokePath, type VectorNetwork } from './vector-network';

/** How far a point may be moved, as a share of the path's size, at the strongest simplification. */
const REACH = 0.08;

/** One contour of a path: the commands that draw it, and whether it comes back to where it started. */
interface Contour {
  readonly commands: PathCommand[];
  readonly closed: boolean;
}

/** Splits path commands into contours, saying of each whether it closes — which the shared reader doesn't. */
function closedContoursOf(commands: readonly PathCommand[]): Contour[] {
  const out: Contour[] = [];
  let current: PathCommand[] = [];
  for (const command of commands) {
    if (command.op === 'M' && current.length > 0) {
      out.push({ commands: current, closed: false });
      current = [];
    }
    if (command.op === 'Z') {
      if (current.length > 0) out.push({ commands: current, closed: true });
      current = [];
      continue;
    }
    current.push(command);
  }
  if (current.length > 0) out.push({ commands: current, closed: false });
  return out;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Past this turn a point counts as a corner, and the path goes straight into it rather than curving through. */
const CORNER = Math.cos(Math.PI / 3);

/**
 * The commands drawing a curve through the points, with Catmull–Rom tangents. A point the path turns sharply at
 * keeps its corner — its tangents go to nothing, so the path runs straight into it — which is what keeps a square
 * a square. A closed contour takes its tangents around the loop, so where it comes back on itself is as smooth as
 * the rest of it.
 */
function smoothCommands(points: readonly Vec2[], closed: boolean): PathCommand[] {
  const n = points.length;
  const first = points[0];
  if (!first || n < 2) return [];
  const at = (i: number) => (closed ? points[((i % n) + n) % n]! : points[Math.max(0, Math.min(n - 1, i))]!);

  /** How much of a point's tangent survives the turn there: all of it on a straight run, none at a corner. */
  const smoothness = (i: number): number => {
    if (!closed && (i <= 0 || i >= n - 1)) return 1;
    const [p0, p1, p2] = [at(i - 1), at(i), at(i + 1)];
    const [ax, ay] = [p1.x - p0.x, p1.y - p0.y];
    const [bx, by] = [p2.x - p1.x, p2.y - p1.y];
    const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (lengths === 0) return 1;
    const turn = (ax * bx + ay * by) / lengths;
    return turn <= CORNER ? 0 : (turn - CORNER) / (1 - CORNER);
  };

  const tangent = (i: number): Vec2 => {
    const f = smoothness(i) / 6;
    const [before, after] = [at(i - 1), at(i + 1)];
    return { x: (after.x - before.x) * f, y: (after.y - before.y) * f };
  };

  const commands: PathCommand[] = [{ op: 'M', x: round(first.x), y: round(first.y) }];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [p1, p2] = [at(i), at(i + 1)];
    const [t1, t2] = [tangent(i), tangent(i + 1)];
    const straight = t1.x === 0 && t1.y === 0 && t2.x === 0 && t2.y === 0;
    commands.push(
      straight
        ? { op: 'L', x: round(p2.x), y: round(p2.y) }
        : { op: 'C', x1: round(p1.x + t1.x), y1: round(p1.y + t1.y), x2: round(p2.x - t2.x), y2: round(p2.y - t2.y), x: round(p2.x), y: round(p2.y) },
    );
  }
  if (closed) commands.push({ op: 'Z' });
  return commands;
}

/** The size of the box a network's vertices sit in, which the simplification's reach is measured against. */
function extent(network: VectorNetwork): number {
  if (network.vertices.length === 0) return 0;
  const xs = network.vertices.map((v) => v.x);
  const ys = network.vertices.map((v) => v.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** How many points a network is drawn with, which is what simplifying it brings down. */
export const vertexCount = (network: VectorNetwork): number => network.vertices.length;

/**
 * Simplifies a path: each of its contours is flattened, thinned of the points that say least about its shape, and
 * drawn again as a smooth curve through the ones that are left. `amount` runs from 0, which changes nothing, to 1,
 * which keeps only the turns that carry the shape. Returns the commands of the simplified path.
 *
 * A branching network — one where a point joins more than two segments — is left as it is: its contours can't be
 * told apart without deciding which branch is the path, and thinning them separately would pull it apart.
 */
export function simplifyNetworkCommands(network: VectorNetwork, amount: number): PathCommand[] | null {
  if (network.segments.length === 0 || amount <= 0) return null;
  const degree = new Map<number, number>();
  for (const segment of network.segments) {
    for (const vertex of [segment.start, segment.end]) degree.set(vertex, (degree.get(vertex) ?? 0) + 1);
  }
  if ([...degree.values()].some((count) => count > 2)) return null;

  const tolerance = extent(network) * REACH * Math.min(1, amount);
  if (tolerance <= 0) return null;
  const out: PathCommand[] = [];
  for (const contour of closedContoursOf(networkStrokePath(network))) {
    const points = flattenPath(contour.commands, 12);
    if (points.length < 2) continue;
    const kept = simplifyPolyline(points, tolerance);
    // A loop comes back to where it started; that repeat is the closing itself, not a point of its own.
    const start = kept[0];
    const end = kept.at(-1);
    const loop = contour.closed && kept.length > 1 && start && end && Math.hypot(end.x - start.x, end.y - start.y) < 1e-6;
    const shape = loop ? kept.slice(0, -1) : kept;
    // A loop needs three points to still be a shape; an open contour needs two to still be a line.
    if (shape.length < (contour.closed ? 3 : 2)) continue;
    out.push(...smoothCommands(shape, contour.closed));
  }
  return out.length > 0 ? out : null;
}
