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
import { cornerBisector, flattenPath, maxCornerRadius, rectangleCorners, roundedPolygon, type PathCommand } from './corners';
import { starPoints } from './shapes';

const square = (r: number, s: number, size = 100) => {
  const { points, radii } = rectangleCorners(size, size, { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r });
  return roundedPolygon(points, radii, s);
};

/** Distance from the flattened outline to the top-right corner (100, 0). */
const cornerGap = (commands: PathCommand[]) => Math.min(...flattenPath(commands, 32).map((p) => Math.hypot(p.x - 100, p.y)));

describe('roundedPolygon', () => {
  test('without smoothing a corner is a circular arc tangent to both edges', () => {
    const points = flattenPath(square(20, 0), 32);
    // Every point of the top-right corner region lies on the circle centered at (80, 20).
    const corner = points.filter((p) => p.x > 80 && p.y < 20);
    expect(corner.length).toBeGreaterThan(10);
    for (const p of corner) expect(Math.hypot(p.x - 80, p.y - 20)).toBeCloseTo(20, 1);
    expect(cornerGap(square(20, 0))).toBeCloseTo(20 * Math.SQRT2 - 20, 1);
  });

  test('smoothing starts the curve further along the edges and keeps it continuous', () => {
    const commands = square(20, 0.6);
    const line = commands.find((c, i) => i > 0 && c.op === 'L' && c.y === 0)!;
    // The top edge ends (1 + 0.6) × 20 = 32 before the top-right corner.
    expect(line.op === 'L' && line.x).toBeCloseTo(68);
    // The first Bézier leaves along the edge: its first control point stays on y = 0.
    const next = commands[commands.indexOf(line) + 1]!;
    expect(next.op).toBe('C');
    if (next.op === 'C') expect(next.y1).toBe(0);
    // The middle of the corner stays on the same circle; the edge eases away before x = 80.
    expect(cornerGap(commands)).toBeCloseTo(cornerGap(square(20, 0)), 1);
    expect(flattenPath(commands, 32).some((p) => p.x > 70 && p.x < 80 && p.y > 0.01)).toBe(true);
    // The outline stays closed and within the box.
    for (const p of flattenPath(commands)) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  test('a short edge reduces smoothing before the radius', () => {
    // 50 is the whole budget of a 100 square: the radius stays, smoothing drops to 0.
    const commands = square(50, 0.6);
    expect(commands.filter((c) => c.op === 'L').every((c) => c.op === 'L' && (c.x === 50 || c.y === 50))).toBe(true);
    const limited = square(40, 1);
    // Radius 40 fits, but (1 + 1) × 40 would overlap the next corner: the curve starts mid-edge.
    const line = limited.find((c, i) => i > 0 && c.op === 'L' && c.y === 0)!;
    expect(line.op === 'L' && line.x).toBeCloseTo(50);
  });

  test('concave star vertices round too, and the path is finite', () => {
    const points = starPoints(100, 100, 5, 0.4);
    const commands = roundedPolygon(points, points.map(() => 6), 0.6);
    const flat = flattenPath(commands);
    expect(flat.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(commands.filter((c) => c.op === 'C').length).toBeGreaterThan(points.length * 2);
  });
});

describe('corner helpers', () => {
  test('bisector and radius limit of a rectangle corner', () => {
    const b = cornerBisector({ x: 0, y: 100 }, { x: 0, y: 0 }, { x: 60, y: 0 })!;
    expect(b.dir.x).toBeCloseTo(Math.SQRT1_2);
    expect(b.dir.y).toBeCloseTo(Math.SQRT1_2);
    expect(b.sinHalf).toBeCloseTo(Math.SQRT1_2);
    expect(maxCornerRadius({ x: 0, y: 100 }, { x: 0, y: 0 }, { x: 60, y: 0 })).toBeCloseTo(30);
  });
});
