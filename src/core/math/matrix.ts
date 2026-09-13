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

import type { Vec2 } from './vec';

/**
 * 2D affine transform in the same layout as Canvas/DOMMatrix:
 * | a c e |
 * | b d f |
 * | 0 0 1 |
 */
export interface Matrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const translation = (x: number, y: number): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
export const scaling = (sx: number, sy: number = sx): Matrix => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });

/** Rotation by `radians`, positive = clockwise in screen space (y down). */
export function rotation(radians: number): Matrix {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/** Returns m1 · m2 (apply m2 first, then m1). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export const determinant = (m: Matrix): number => m.a * m.d - m.b * m.c;

/** Inverse, or null when the matrix is singular (e.g. zero-size scale). */
export function invert(m: Matrix): Matrix | null {
  const det = determinant(m);
  if (Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export const apply = (m: Matrix, p: Vec2): Vec2 => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
});

/** Applies only the linear part (for directions/handles). */
export const applyLinear = (m: Matrix, p: Vec2): Vec2 => ({
  x: m.a * p.x + m.c * p.y,
  y: m.b * p.x + m.d * p.y,
});

/** Angle of the transformed x-axis, in radians. */
export const rotationOf = (m: Matrix): number => Math.atan2(m.b, m.a);

export const scaleOf = (m: Matrix): Vec2 => ({
  x: Math.hypot(m.a, m.b),
  y: determinant(m) / Math.hypot(m.a, m.b),
});

export const isIdentity = (m: Matrix, eps = 1e-12): boolean =>
  Math.abs(m.a - 1) < eps &&
  Math.abs(m.b) < eps &&
  Math.abs(m.c) < eps &&
  Math.abs(m.d - 1) < eps &&
  Math.abs(m.e) < eps &&
  Math.abs(m.f) < eps;
