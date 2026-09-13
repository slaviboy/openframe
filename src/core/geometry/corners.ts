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
import type { CornerRadii } from '../schema/document';

/** Outline commands in layer-local coordinates (absolute points). */
export type PathCommand =
  | { readonly op: 'M'; readonly x: number; readonly y: number }
  | { readonly op: 'L'; readonly x: number; readonly y: number }
  | { readonly op: 'C'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly x: number; readonly y: number }
  | { readonly op: 'Z' };

/** Corner smoothing of the iOS preset (60%). */
export const IOS_CORNER_SMOOTHING = 0.6;

/** Per-corner radii of a frame or rectangle (the uniform radius when corners are not independent). */
export function resolveCornerRadii(node: { readonly cornerRadius: number; readonly cornerRadii?: CornerRadii | undefined }): CornerRadii {
  return node.cornerRadii ?? { topLeft: node.cornerRadius, topRight: node.cornerRadius, bottomRight: node.cornerRadius, bottomLeft: node.cornerRadius };
}

/** Rectangle vertices (clockwise from the top left) and their radii, for `roundedPolygon`. */
export function rectangleCorners(width: number, height: number, radii: CornerRadii): { points: Vec2[]; radii: number[] } {
  return {
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    radii: [radii.topLeft, radii.topRight, radii.bottomRight, radii.bottomLeft],
  };
}

interface CornerFrame {
  /** Unit direction of the incoming edge. */
  readonly u: Vec2;
  /** Unit direction of the outgoing edge. */
  readonly w: Vec2;
  /** +1 when the outline turns clockwise (y down) at the vertex, −1 otherwise. */
  readonly turn: number;
  /** Interior angle at the vertex, in radians. */
  readonly theta: number;
  /** Half of the shorter adjacent edge: the most a corner may take from either edge. */
  readonly budget: number;
}

function cornerFrame(prev: Vec2, v: Vec2, next: Vec2): CornerFrame | null {
  const l1 = Math.hypot(v.x - prev.x, v.y - prev.y);
  const l2 = Math.hypot(next.x - v.x, next.y - v.y);
  if (l1 === 0 || l2 === 0) return null;
  const u = { x: (v.x - prev.x) / l1, y: (v.y - prev.y) / l1 };
  const w = { x: (next.x - v.x) / l2, y: (next.y - v.y) / l2 };
  const cos = Math.min(1, Math.max(-1, -(u.x * w.x + u.y * w.y)));
  const theta = Math.acos(cos);
  if (theta < 1e-6 || Math.PI - theta < 1e-6) return null;
  const cross = u.x * w.y - u.y * w.x;
  return { u, w, turn: cross >= 0 ? 1 : -1, theta, budget: Math.min(l1, l2) / 2 };
}

/** Largest radius a vertex can take: its tangent points must stay within half of each adjacent edge. */
export function maxCornerRadius(prev: Vec2, v: Vec2, next: Vec2): number {
  const f = cornerFrame(prev, v, next);
  return f ? f.budget * Math.tan(f.theta / 2) : 0;
}

/**
 * Unit direction from a vertex into the shape along its angle bisector, and sin(θ/2): a corner of
 * radius r has its arc center r / sin(θ/2) from the vertex along this direction.
 */
export function cornerBisector(prev: Vec2, v: Vec2, next: Vec2): { dir: Vec2; sinHalf: number } | null {
  const f = cornerFrame(prev, v, next);
  if (!f) return null;
  const bx = -f.u.x + f.w.x;
  const by = -f.u.y + f.w.y;
  const len = Math.hypot(bx, by);
  if (len === 0) return null;
  return { dir: { x: bx / len, y: by / len }, sinHalf: Math.sin(f.theta / 2) };
}

const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const perp = (v: Vec2, turn: number): Vec2 => ({ x: -v.y * turn, y: v.x * turn });
const cubic = (c1: Vec2, c2: Vec2, end: Vec2): PathCommand => ({ op: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: end.x, y: end.y });

/**
 * Closed outline through `points` with each vertex rounded by its radius. With `smoothing` (0–1)
 * a corner becomes a continuous-curvature "squircle" corner: the circular arc shrinks to
 * (1 − smoothing) of its sweep and cubic Béziers ease into it from the straight edges, starting up
 * to (1 + smoothing) times further from the vertex than a plain round corner. When an edge is too
 * short for that, smoothing is reduced first, then the radius, so adjacent corners never overlap.
 * For a 90° corner this is the construction used by the reference's corner smoothing.
 */
export function roundedPolygon(points: readonly Vec2[], radii: readonly number[], smoothing: number): PathCommand[] {
  const n = points.length;
  if (n < 3) return [];
  const s = Math.min(1, Math.max(0, smoothing));
  const first = points[0]!;
  const last = points[n - 1]!;
  const commands: PathCommand[] = [{ op: 'M', x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 }];
  for (let i = 0; i < n; i++) {
    const v = points[i]!;
    const f = cornerFrame(points[(i + n - 1) % n]!, v, points[(i + 1) % n]!);
    const requested = Math.max(0, radii[i] ?? 0);
    if (!f || requested <= 0) {
      commands.push({ op: 'L', x: v.x, y: v.y });
      continue;
    }
    const tanHalf = Math.tan(f.theta / 2);
    const r = Math.min(requested, f.budget * tanHalf);
    // Distance from the vertex to where a plain round corner meets the edge.
    const tangent = r / tanHalf;
    const smooth = tangent > 0 ? Math.max(0, Math.min(s, f.budget / tangent - 1)) : 0;
    const p = Math.min((1 + smooth) * tangent, f.budget);
    const sweep = Math.PI - f.theta;
    const alpha = (smooth * sweep) / 2;
    const n1 = perp(f.u, f.turn);
    const center = add(add(v, f.u, -tangent), n1, r);
    // Where the arc starts, measured from the curve's start S = V − p·u (along u, and into the shape).
    const along = p - tangent + r * Math.sin(alpha);
    const inward = r * (1 - Math.cos(alpha));
    const c = alpha > 1e-9 ? inward / Math.tan(alpha) : 0;
    const ab = Math.max(0, along - c);
    const a = (2 * ab) / 3;

    // Mirror frame: walking backwards along the outgoing edge.
    const u2 = { x: -f.w.x, y: -f.w.y };
    const n2 = perp(f.w, f.turn);
    const start = add(v, f.u, -p);
    const arcStart = add(add(center, f.u, r * Math.sin(alpha)), n1, -r * Math.cos(alpha));
    const end = add(v, u2, -p);
    const arcEnd = add(add(center, u2, r * Math.sin(alpha)), n2, -r * Math.cos(alpha));

    commands.push({ op: 'L', x: start.x, y: start.y });
    if (smooth > 0) commands.push(cubic(add(start, f.u, a), add(start, f.u, ab), arcStart));
    const delta = f.turn * sweep * (1 - smooth);
    if (Math.abs(delta) > 1e-9) {
      const phi0 = Math.atan2(arcStart.y - center.y, arcStart.x - center.x);
      const segments = Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9);
      const step = delta / segments;
      const k = (4 / 3) * Math.tan(step / 4);
      for (let j = 0; j < segments; j++) {
        const pa = phi0 + step * j;
        const pb = pa + step;
        const p0 = { x: center.x + r * Math.cos(pa), y: center.y + r * Math.sin(pa) };
        const p3 = j === segments - 1 ? arcEnd : { x: center.x + r * Math.cos(pb), y: center.y + r * Math.sin(pb) };
        commands.push(
          cubic({ x: p0.x - k * r * Math.sin(pa), y: p0.y + k * r * Math.cos(pa) }, { x: p3.x + k * r * Math.sin(pb), y: p3.y - k * r * Math.cos(pb) }, p3),
        );
      }
    }
    if (smooth > 0) commands.push(cubic(add(end, u2, ab), add(end, u2, a), end));
  }
  commands.push({ op: 'Z' });
  return commands;
}

/** Polyline approximation of an outline (each cubic becomes `segments` line segments). */
export function flattenPath(commands: readonly PathCommand[], segments = 8): Vec2[] {
  const out: Vec2[] = [];
  let cur: Vec2 = { x: 0, y: 0 };
  for (const cmd of commands) {
    if (cmd.op === 'Z') continue;
    if (cmd.op === 'M' || cmd.op === 'L') {
      cur = { x: cmd.x, y: cmd.y };
      out.push(cur);
      continue;
    }
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const mt = 1 - t;
      const b0 = mt * mt * mt;
      const b1 = 3 * mt * mt * t;
      const b2 = 3 * mt * t * t;
      const b3 = t * t * t;
      out.push({ x: b0 * cur.x + b1 * cmd.x1 + b2 * cmd.x2 + b3 * cmd.x, y: b0 * cur.y + b1 * cmd.y1 + b2 * cmd.y2 + b3 * cmd.y });
    }
    cur = { x: cmd.x, y: cmd.y };
  }
  return out;
}
