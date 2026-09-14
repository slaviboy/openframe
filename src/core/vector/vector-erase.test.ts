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
import type { Paint } from '../schema/document';
import { eraseNetwork, eraseOpenSegments, subCubic } from './vector-erase';
import { straightSegment, type VectorNetwork } from './vector-network';

/** An open horizontal line from (0, 0) to (200, 0). */
const line: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
  ],
  segments: [straightSegment(0, 1)],
  regions: [],
};

describe('eraser on open paths', () => {
  test('erasing across the middle of a line leaves two stretches with new end points at the edges of the erased band', () => {
    const erased = eraseOpenSegments(line, [{ x: 100, y: -50 }, { x: 100, y: 50 }], 20);
    expect(erased.segments).toHaveLength(2);
    const [left, right] = erased.segments;
    expect(erased.vertices[left!.start]).toEqual({ x: 0, y: 0 });
    expect(erased.vertices[left!.end]!.x).toBeCloseTo(90, 5);
    expect(erased.vertices[right!.start]!.x).toBeCloseTo(110, 5);
    expect(erased.vertices[right!.end]).toEqual({ x: 200, y: 0 });
    expect(erased.segments.every((s) => s.tangentStart.x === 0 && s.tangentEnd.x === 0)).toBe(true);
  });

  test("erasing a line's end shortens it and removes the end point", () => {
    const erased = eraseOpenSegments(line, [{ x: 200, y: -50 }, { x: 200, y: 50 }], 20);
    expect(erased.vertices).toHaveLength(2);
    expect(erased.segments).toHaveLength(1);
    expect(erased.vertices[erased.segments[0]!.end]!.x).toBeCloseTo(190, 5);
  });

  test('erasing along the whole line removes it', () => {
    const erased = eraseOpenSegments(line, [{ x: -10, y: 0 }, { x: 210, y: 0 }], 20);
    expect(erased.segments).toEqual([]);
    expect(erased.vertices).toEqual([]);
  });

  test('region outlines and paths the eraser misses are left as they are', () => {
    const square: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)],
      regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' }],
    };
    expect(eraseOpenSegments(square, [{ x: 50, y: -50 }, { x: 50, y: 150 }], 20)).toBe(square);
    expect(eraseOpenSegments(line, [{ x: 100, y: 100 }], 20)).toBe(line);
  });

  test('a stretch of a curve keeps the curve: its ends lie on the original', () => {
    const curve = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    ] as const;
    const [a, , , d] = subCubic(curve, 0.25, 0.75);
    // The point at t = 0.25 of this curve is (15.625, 56.25); at 0.75, (84.375, 56.25).
    expect(a.x).toBeCloseTo(15.625);
    expect(a.y).toBeCloseTo(56.25);
    expect(d.x).toBeCloseTo(84.375);
    expect(d.y).toBeCloseTo(56.25);
  });

  describe('eraseNetwork', () => {
    const red = { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true } as unknown as Paint;
    const filled: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)],
      regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO', fills: [red] }],
    };
    const path = [{ x: 100, y: -20 }, { x: 100, y: 120 }];

    test('a region the eraser reaches is rebuilt from what is left of it, keeping its fills', () => {
      // What the engine leaves of the square after erasing a band down its right-hand edge.
      const rest = [
        { op: 'M', x: 0, y: 0 },
        { op: 'L', x: 90, y: 0 },
        { op: 'L', x: 90, y: 100 },
        { op: 'L', x: 0, y: 100 },
        { op: 'Z' },
      ] as const;
      const erased = eraseNetwork(filled, path, 20, () => [...rest]);
      expect(erased.vertices).toEqual([
        { x: 0, y: 0 },
        { x: 90, y: 0 },
        { x: 90, y: 100 },
        { x: 0, y: 100 },
      ]);
      expect(erased.segments).toHaveLength(4);
      expect(erased.regions).toEqual([{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO', fills: [red] }]);
    });

    test('nothing changes when the eraser misses, and a region erased completely goes with its outline', () => {
      expect(eraseNetwork(filled, path, 20, () => null)).toBe(filled);
      expect(eraseNetwork(filled, path, 20, () => [])).toEqual({ vertices: [], segments: [], regions: [] });
    });
  });
});
