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
import { networkStrokePath, type VectorNetwork } from './vector-network';

/** A point of a variable-width stroke: where it sits along the path (0–1 of its length) and the stroke's full width there. */
export interface WidthPoint {
  readonly position: number;
  readonly width: number;
}

/** A path without branches, flattened into an ordered polyline. */
export interface StrokeChain {
  readonly points: readonly Vec2[];
  /** Distance along the path to each point. */
  readonly lengths: readonly number[];
  /** Where the network's vertices fall along the path, as positions (0–1 of the length). */
  readonly vertexPositions: readonly number[];
  readonly closed: boolean;
}

const cubicPoint = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

/**
 * The network's stroke as one ordered polyline, or null when a variable width can't follow it: a point
 * joins more than two segments (a branching path) or the network has more than one path.
 */
export function strokeChain(network: VectorNetwork, segmentsPerCurve = 16): StrokeChain | null {
  if (network.segments.length === 0) return null;
  const degree = new Map<number, number>();
  for (const s of network.segments) {
    degree.set(s.start, (degree.get(s.start) ?? 0) + 1);
    degree.set(s.end, (degree.get(s.end) ?? 0) + 1);
  }
  if ([...degree.values()].some((d) => d > 2)) return null;
  const commands = networkStrokePath(network);
  if (commands.filter((c) => c.op === 'M').length !== 1) return null;
  const points: Vec2[] = [];
  const vertexIndices: number[] = [];
  let closed = false;
  for (const c of commands) {
    if (c.op === 'M' || c.op === 'L') {
      points.push({ x: c.x, y: c.y });
      vertexIndices.push(points.length - 1);
    } else if (c.op === 'C') {
      const from = points[points.length - 1]!;
      for (let k = 1; k <= segmentsPerCurve; k++) points.push(cubicPoint(from, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x, y: c.y }, k / segmentsPerCurve));
      vertexIndices.push(points.length - 1);
    } else {
      closed = true;
    }
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  const total = lengths[lengths.length - 1]!;
  if (total <= 0) return null;
  return { points, lengths, closed, vertexPositions: vertexIndices.map((i) => lengths[i]! / total) };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The stroke's width at a position: eased between the width points on either side, the nearest point's
 * width before the first and after the last, and `fallback` (the uniform stroke weight) without points.
 */
export function widthAt(points: readonly WidthPoint[], position: number, fallback: number): number {
  if (points.length === 0) return fallback;
  const sorted = [...points].sort((a, b) => a.position - b.position);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (position <= first.position) return first.width;
  if (position >= last.position) return last.width;
  const i = sorted.findIndex((p) => p.position > position);
  const a = sorted[i - 1]!;
  const b = sorted[i]!;
  return a.width + (b.width - a.width) * smooth((position - a.position) / (b.position - a.position || 1));
}

/** The unit normal at a polyline point, to the left of the direction of travel, from its neighbours. */
function normalAt(points: readonly Vec2[], i: number, closed: boolean): Vec2 {
  const n = points.length;
  const prev = i > 0 ? points[i - 1]! : closed ? points[n - 2]! : points[i]!;
  const next = i < n - 1 ? points[i + 1]! : closed ? points[1]! : points[i]!;
  const length = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
  // 0 − dy keeps a zero component +0.
  return { x: (0 - (next.y - prev.y)) / length, y: (next.x - prev.x) / length };
}

/**
 * The filled outline of a variable-width stroke: each side offset by half the width there. An open path
 * is one polygon (along one side and back along the other); a closed path is two loops running opposite
 * ways, so the inside stays empty.
 */
export function variableWidthOutline(chain: StrokeChain, points: readonly WidthPoint[], fallback: number): Vec2[][] {
  const total = chain.lengths[chain.lengths.length - 1]!;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  chain.points.forEach((p, i) => {
    const n = normalAt(chain.points, i, chain.closed);
    const half = widthAt(points, chain.lengths[i]! / total, fallback) / 2;
    left.push({ x: p.x + n.x * half, y: p.y + n.y * half });
    right.push({ x: p.x - n.x * half, y: p.y - n.y * half });
  });
  right.reverse();
  return chain.closed ? [left, right] : [[...left, ...right]];
}

/** The point of the chain nearest to `p`: its position (0–1 of the length), the point, and its distance. */
export function nearestOnChain(chain: StrokeChain, p: Vec2): { position: number; point: Vec2; distance: number } {
  const total = chain.lengths[chain.lengths.length - 1]!;
  let best = { position: 0, point: chain.points[0]!, distance: Infinity };
  for (let i = 1; i < chain.points.length; i++) {
    const a = chain.points[i - 1]!;
    const b = chain.points[i]!;
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const distance = Math.hypot(p.x - q.x, p.y - q.y);
    if (distance < best.distance) best = { position: (chain.lengths[i - 1]! + Math.sqrt(lengthSquared) * t) / total, point: q, distance };
  }
  return best;
}

/** The point and unit normal at a position along the chain. */
export function chainPointAt(chain: StrokeChain, position: number): { point: Vec2; normal: Vec2 } {
  const total = chain.lengths[chain.lengths.length - 1]!;
  const target = Math.max(0, Math.min(1, position)) * total;
  const i = Math.max(1, chain.lengths.findIndex((l) => l >= target));
  const a = chain.points[i - 1]!;
  const b = chain.points[i]!;
  const span = chain.lengths[i]! - chain.lengths[i - 1]!;
  const t = span > 0 ? (target - chain.lengths[i - 1]!) / span : 0;
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, normal: { x: (0 - (b.y - a.y)) / length, y: (b.x - a.x) / length } };
}

/**
 * Snaps a position to where a width point usually goes — on a vector point, halfway between two vector
 * points, or halfway between two width points — when one is within `tolerance` (of the length).
 */
export function snapPosition(chain: StrokeChain, points: readonly WidthPoint[], position: number, tolerance: number): number {
  const vertices = [...new Set(chain.vertexPositions)].sort((a, b) => a - b);
  const widths = points.map((p) => p.position).sort((a, b) => a - b);
  const halfway = (list: readonly number[]) => list.slice(1).map((v, i) => (list[i]! + v) / 2);
  let best = position;
  let bestDistance = tolerance;
  for (const candidate of [...vertices, ...halfway(vertices), ...halfway(widths)]) {
    const distance = Math.abs(candidate - position);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** The width points with one more at `position`, in order along the path, and the new point's index. */
export function addWidthPoint(points: readonly WidthPoint[], position: number, width: number): { points: WidthPoint[]; index: number } {
  const added = { position, width };
  const next = [...points, added].sort((a, b) => a.position - b.position);
  return { points: next, index: next.indexOf(added) };
}
