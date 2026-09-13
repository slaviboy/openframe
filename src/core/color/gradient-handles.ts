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

import { apply, invert, multiply, scaling, type Matrix } from '../math/matrix';
import type { Vec2 } from '../math/vec';
import type { GradientPaint, GradientType, Size, Transform } from '../schema/document';

/**
 * On-canvas gradient handles, in layer coordinates (pixels).
 * - Linear: `start` and `end` of the gradient line; color bands stay perpendicular to it.
 * - Radial, angular, diamond: `start` is the center, `end` the edge along the gradient's x axis
 *   (where the last stop sits), `width` the edge along its y axis.
 */
export interface GradientHandles {
  readonly start: Vec2;
  readonly end: Vec2;
  readonly width: Vec2;
}

/** Gradient-space positions of the handles (see GradientPaint). */
const LINEAR_POINTS: readonly [Vec2, Vec2, Vec2] = [
  { x: 0, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0, y: 1 },
];
const CENTERED_POINTS: readonly [Vec2, Vec2, Vec2] = [
  { x: 0.5, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
];

const toMatrix = ([a, b, c, d, e, f]: Transform): Matrix => ({ a, b, c, d, e, f });
const layerScale = (size: Size): Matrix => scaling(Math.max(size.width, 1e-6), Math.max(size.height, 1e-6));

/** Handle positions for a gradient paint on a layer of `size`. */
export function gradientHandles(paint: GradientPaint, size: Size): GradientHandles {
  const toLayer = multiply(layerScale(size), toMatrix(paint.gradientTransform));
  const [s, e, w] = paint.type === 'GRADIENT_LINEAR' ? LINEAR_POINTS : CENTERED_POINTS;
  const start = apply(toLayer, s);
  const end = apply(toLayer, e);
  if (paint.type !== 'GRADIENT_LINEAR') return { start, end, width: apply(toLayer, w) };
  return { start, end, width: linearWidthPoint(start, end) };
}

/** For linear gradients the third point keeps bands perpendicular: half the line length, rotated 90° clockwise. */
function linearWidthPoint(start: Vec2, end: Vec2): Vec2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return { x: start.x - dy / 2, y: start.y + dx / 2 };
}

/**
 * The `gradientTransform` whose handles are `handles` (the width handle is ignored for linear
 * gradients). Null when the handles are degenerate (coincident or collinear).
 */
export function gradientTransformFromHandles(type: GradientType, handles: Pick<GradientHandles, 'start' | 'end'> & { width?: Vec2 }, size: Size): Transform | null {
  const linear = type === 'GRADIENT_LINEAR';
  const [u0, u1, u2] = linear ? LINEAR_POINTS : CENTERED_POINTS;
  const p0 = handles.start;
  const p1 = handles.end;
  const p2 = linear || !handles.width ? linearWidthPoint(p0, p1) : handles.width;
  // Affine maps sending the gradient-space basis at u0 (and at p0) to the handle vectors.
  const from: Matrix = { a: u1.x - u0.x, b: u1.y - u0.y, c: u2.x - u0.x, d: u2.y - u0.y, e: u0.x, f: u0.y };
  const to: Matrix = { a: p1.x - p0.x, b: p1.y - p0.y, c: p2.x - p0.x, d: p2.y - p0.y, e: p0.x, f: p0.y };
  if (Math.abs(to.a * to.d - to.b * to.c) < 1e-9) return null;
  const fromInverse = invert(from);
  const layerInverse = invert(layerScale(size));
  if (!fromInverse || !layerInverse) return null;
  const m = multiply(layerInverse, multiply(to, fromInverse));
  return [m.a, m.b, m.c, m.d, m.e, m.f].map((v) => Math.round(v * 1e6) / 1e6) as Transform;
}

/** Where a stop at `position` (0–1) sits on the canvas: along start → end. */
export const stopPoint = (handles: GradientHandles, position: number): Vec2 => ({
  x: handles.start.x + (handles.end.x - handles.start.x) * position,
  y: handles.start.y + (handles.end.y - handles.start.y) * position,
});

/** The stop position (0–1) closest to a point, by projection onto start → end. */
export function positionOnGradient(handles: GradientHandles, p: Vec2): number {
  const dx = handles.end.x - handles.start.x;
  const dy = handles.end.y - handles.start.y;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return 0;
  const t = ((p.x - handles.start.x) * dx + (p.y - handles.start.y) * dy) / length2;
  return Math.round(Math.min(1, Math.max(0, t)) * 1000) / 1000;
}
