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
import type { PathCommand } from './corners';

/** An ellipse's arc: angles in radians, clockwise on screen from the right-hand point; `innerRadius` is 0–1 of the radius. */
export interface Arc {
  readonly startingAngle: number;
  readonly endingAngle: number;
  readonly innerRadius: number;
}

const TAU = Math.PI * 2;
const EPSILON = 1e-9;

/** The arc's sweep in radians, limited to one full turn either way. */
export const arcSweep = (arc: Arc): number => Math.max(-TAU, Math.min(TAU, arc.endingAngle - arc.startingAngle));

/** Whether the arc goes all the way around (a full ellipse, or a closed ring). */
export const isFullTurn = (arc: Arc): boolean => Math.abs(arcSweep(arc)) >= TAU - EPSILON;

/** The point at parametric `angle` on the ellipse filling a width × height box, scaled toward its center by `scale`. */
export function ellipsePoint(width: number, height: number, angle: number, scale = 1): Vec2 {
  return { x: width / 2 + (width / 2) * scale * Math.cos(angle), y: height / 2 + (height / 2) * scale * Math.sin(angle) };
}

/** Cubic curves tracing the (scaled) ellipse from angle `from` to `to`, in either direction, in spans of at most 90°. */
function arcCurves(width: number, height: number, scale: number, from: number, to: number): PathCommand[] {
  const [cx, cy] = [width / 2, height / 2];
  const [rx, ry] = [cx * scale, cy * scale];
  const count = Math.max(1, Math.ceil(Math.abs(to - from) / (Math.PI / 2) - EPSILON));
  const step = (to - from) / count;
  // Control points lie along the tangents at 4/3·tan(span/4) of the radius.
  const k = (4 / 3) * Math.tan(step / 4);
  const curves: PathCommand[] = [];
  for (let i = 0; i < count; i++) {
    const a = from + step * i;
    const b = a + step;
    const [ca, sa, cb, sb] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)];
    curves.push({ op: 'C', x1: cx + rx * (ca - k * sa), y1: cy + ry * (sa + k * ca), x2: cx + rx * (cb + k * sb), y2: cy + ry * (sb - k * cb), x: cx + rx * cb, y: cy + ry * sb });
  }
  return curves;
}

/**
 * The arc's outline: a pie slice without an inner radius, a ring segment with one. A full turn is the
 * whole ellipse, or for a ring two contours running in opposite directions so the hole stays empty.
 */
export function arcCommands(width: number, height: number, arc: Arc): PathCommand[] {
  const sweep = arcSweep(arc);
  if (Math.abs(sweep) < EPSILON) return [];
  const start = arc.startingAngle;
  const end = start + sweep;
  const inner = Math.min(1, Math.max(0, arc.innerRadius));
  const close: PathCommand = { op: 'Z' };
  const at = (angle: number, scale = 1): Vec2 => ellipsePoint(width, height, angle, scale);
  const outer: PathCommand[] = [{ op: 'M', ...at(start) }, ...arcCurves(width, height, 1, start, end)];
  if (isFullTurn(arc)) {
    if (inner <= 0) return [...outer, close];
    return [...outer, close, { op: 'M', ...at(end, inner) }, ...arcCurves(width, height, inner, end, start), close];
  }
  if (inner <= 0) return [...outer, { op: 'L', x: width / 2, y: height / 2 }, close];
  return [...outer, { op: 'L', ...at(end, inner) }, ...arcCurves(width, height, inner, end, start), close];
}

/** Whether a parametric angle lies on the arc's sweep. */
export function withinSweep(arc: Arc, angle: number): boolean {
  const sweep = arcSweep(arc);
  // How far clockwise the angle is from the start, in [0, 2π).
  const offset = (((angle - arc.startingAngle) % TAU) + TAU) % TAU;
  return sweep >= 0 ? offset <= sweep + EPSILON : offset === 0 || offset >= TAU + sweep - EPSILON;
}

/** Whether a layer-local point is inside the arc's filled area, allowing `tolerance` across its round edges. */
export function arcContains(width: number, height: number, arc: Arc, p: Vec2, tolerance: number): boolean {
  const [rx, ry] = [width / 2, height / 2];
  if (rx <= 0 || ry <= 0) return false;
  const [nx, ny] = [(p.x - rx) / rx, (p.y - ry) / ry];
  const r = Math.hypot(nx, ny);
  const slack = tolerance / Math.min(rx, ry);
  if (r > 1 + slack || r < arc.innerRadius - slack) return false;
  return isFullTurn(arc) || withinSweep(arc, Math.atan2(ny, nx));
}
