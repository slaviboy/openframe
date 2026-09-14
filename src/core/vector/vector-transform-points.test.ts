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
import { straightSegment, type VectorNetwork } from './vector-network';
import { pointsBounds, rotatePoints, scalePoints } from './vector-transform-points';

/** A square whose top edge (0 → 1) curves: its handles are (10, 10) at vertex 0 and (−10, 10) at vertex 1. */
const square: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
  segments: [
    { start: 0, end: 1, tangentStart: { x: 10, y: 10 }, tangentEnd: { x: -10, y: 10 } },
    straightSegment(1, 2),
    straightSegment(2, 3),
    straightSegment(3, 0),
  ],
  regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' }],
};

describe('transforming selected points with their bounding box', () => {
  test('the box around selected points, and none for a single point', () => {
    expect(pointsBounds(square, [1, 2])).toEqual({ x: 100, y: 0, width: 0, height: 100 });
    expect(pointsBounds(square, [0, 1, 2, 3])).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(pointsBounds(square, [2])).toBeNull();
    expect(pointsBounds(square, [2, 2])).toBeNull();
  });

  test('resizing moves the points with the box and stretches only the handles at them', () => {
    const scaled = scalePoints(square, [0, 1, 2, 3], { x: 0, y: 0, width: 100, height: 100 }, { x0: 0, y0: 0, x1: 200, y1: 50 });
    expect(scaled.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 50 },
      { x: 0, y: 50 },
    ]);
    expect(scaled.segments[0]).toEqual({ start: 0, end: 1, tangentStart: { x: 20, y: 5 }, tangentEnd: { x: -20, y: 5 } });

    // Only vertex 1 selected (a zero-width box): its handle keeps its width and scales vertically, vertex 0's stays.
    const one = scalePoints(square, [1, 2], { x: 100, y: 0, width: 0, height: 100 }, { x0: 100, y0: 0, x1: 100, y1: 200 });
    expect(one.vertices.slice(1, 3)).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ]);
    expect(one.segments[0]!.tangentStart).toEqual({ x: 10, y: 10 });
    expect(one.segments[0]!.tangentEnd).toEqual({ x: -10, y: 20 });
    expect(one.regions).toBe(square.regions);
  });

  test('a flipped box mirrors the points, and zero handle components stay +0', () => {
    const flipped = scalePoints(square, [0, 1, 2, 3], { x: 0, y: 0, width: 100, height: 100 }, { x0: 100, y0: 0, x1: 0, y1: 100 });
    expect(flipped.vertices[0]).toEqual({ x: 100, y: 0 });
    expect(flipped.vertices[1]).toEqual({ x: 0, y: 0 });
    expect(flipped.segments[0]!.tangentStart).toEqual({ x: -10, y: 10 });
    expect(Object.is(flipped.segments[1]!.tangentStart.x, 0)).toBe(true);
  });

  test('rotating turns the points about the pivot and the handles with them', () => {
    const turned = rotatePoints(square, [1], { x: 0, y: 0 }, Math.PI / 2);
    expect(turned.vertices[1]!.x).toBeCloseTo(0);
    expect(turned.vertices[1]!.y).toBeCloseTo(100);
    expect(turned.segments[0]!.tangentEnd.x).toBeCloseTo(-10);
    expect(turned.segments[0]!.tangentEnd.y).toBeCloseTo(-10);
    // The unselected vertex 0 and its handle stay put.
    expect(turned.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(turned.segments[0]!.tangentStart).toEqual({ x: 10, y: 10 });
  });
});
