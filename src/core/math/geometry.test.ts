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

import { describe, expect, test } from 'vitest';
import { apply, invert, multiply, rotation, rotationOf, scaling, translation } from './matrix';
import { bounds, nearestT, pointAt, split } from './bezier';
import { fromPoints, transformRect, union } from './rect';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('matrix', () => {
  test('multiply applies right-hand matrix first', () => {
    const m = multiply(translation(10, 0), scaling(2));
    const p = apply(m, { x: 1, y: 1 });
    close(p.x, 12);
    close(p.y, 2);
  });

  test('invert round-trips', () => {
    const m = multiply(translation(5, -3), multiply(rotation(0.7), scaling(2, 3)));
    const inv = invert(m);
    expect(inv).not.toBeNull();
    const p = apply(inv!, apply(m, { x: 4, y: -9 }));
    close(p.x, 4);
    close(p.y, -9);
  });

  test('singular matrix has no inverse', () => {
    expect(invert(scaling(0, 1))).toBeNull();
  });

  test('rotationOf recovers angle', () => {
    close(rotationOf(rotation(1.2)), 1.2);
  });
});

describe('rect', () => {
  test('fromPoints normalizes', () => {
    expect(fromPoints({ x: 10, y: 5 }, { x: 0, y: 20 })).toEqual({ x: 0, y: 5, width: 10, height: 15 });
  });

  test('union', () => {
    expect(union({ x: 0, y: 0, width: 1, height: 1 }, { x: 5, y: -2, width: 1, height: 1 })).toEqual({
      x: 0,
      y: -2,
      width: 6,
      height: 3,
    });
  });

  test('transformRect of 90° rotation swaps extents', () => {
    const r = transformRect(rotation(Math.PI / 2), { x: 0, y: 0, width: 10, height: 4 });
    close(r.width, 4);
    close(r.height, 10);
  });
});

describe('bezier', () => {
  const c = { p0: { x: 0, y: 0 }, p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, p3: { x: 100, y: 0 } };

  test('bounds include curve extrema, not control points', () => {
    const b = bounds(c);
    close(b.x, 0);
    close(b.width, 100);
    close(b.height, 75);
  });

  test('split halves meet at the curve midpoint', () => {
    const [l, r] = split(c, 0.5);
    const mid = pointAt(c, 0.5);
    close(l.p3.x, mid.x);
    close(r.p0.y, mid.y);
  });

  test('nearestT finds apex', () => {
    expect(nearestT(c, { x: 50, y: 200 })).toBeCloseTo(0.5, 3);
  });
});
