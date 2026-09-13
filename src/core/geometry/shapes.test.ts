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
import { clampCornerRadius, distanceToSegment, lineCapSize, pointInPolygon, polygonPoints, starPoints } from './shapes';

describe('clampCornerRadius', () => {
  test('a square corner keeps radii up to half the shorter edge', () => {
    const prev = { x: 0, y: 10 };
    const v = { x: 0, y: 0 };
    const next = { x: 40, y: 0 };
    expect(clampCornerRadius(prev, v, next, 3)).toBeCloseTo(3);
    // tan(45°) = 1, half of the 10px edge is 5.
    expect(clampCornerRadius(prev, v, next, 50)).toBeCloseTo(5);
    expect(clampCornerRadius(prev, v, next, 0)).toBe(0);
  });

  test('sharp corners allow smaller radii; straight or degenerate corners allow none', () => {
    const sharp = clampCornerRadius({ x: -10, y: 100 }, { x: 0, y: 0 }, { x: 10, y: 100 }, 1000);
    const blunt = clampCornerRadius({ x: -100, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 10 }, 1000);
    expect(sharp).toBeLessThan(blunt);
    expect(clampCornerRadius({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 5)).toBe(0);
    expect(clampCornerRadius({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 5)).toBe(0);
  });
});

describe('shape geometry', () => {
  test('a triangle fills its box with the apex at the top center', () => {
    const [top, right, left] = polygonPoints(100, 80, 3);
    expect(top!.x).toBeCloseTo(50);
    expect(top!.y).toBeCloseTo(0);
    expect(right!.x).toBeCloseTo(100);
    expect(right!.y).toBeCloseTo(80);
    expect(left!.x).toBeCloseTo(0);
  });

  test('point counts are clamped to 3–60', () => {
    expect(polygonPoints(10, 10, 1)).toHaveLength(3);
    expect(polygonPoints(10, 10, 99)).toHaveLength(60);
  });

  test('stars alternate outer and inner vertices within the box', () => {
    const points = starPoints(100, 100, 5, 0.38);
    expect(points).toHaveLength(10);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(100 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(100 + 1e-9);
    }
    expect(points[0]!.y).toBeCloseTo(0);
  });

  test('pointInPolygon and distanceToSegment', () => {
    const triangle = polygonPoints(100, 100, 3);
    expect(pointInPolygon({ x: 50, y: 80 }, triangle)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 5 }, triangle)).toBe(false);
    expect(distanceToSegment({ x: 50, y: 3 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(3);
    expect(distanceToSegment({ x: 110, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(10);
    expect(lineCapSize(1)).toBe(6);
    expect(lineCapSize(4)).toBe(16);
  });
});
