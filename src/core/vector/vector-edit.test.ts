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
import { deleteVertices, moveVertices, nearestOnSegments, segmentPoint, splitSegment } from './vector-edit';
import { regionFillPath, straightSegment, type VectorNetwork } from './vector-network';

// A triangle whose segments point in mixed directions: 0→1, 2→1 (reversed), 2→0.
const triangle: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ],
  segments: [straightSegment(0, 1), straightSegment(2, 1), straightSegment(2, 0)],
  regions: [{ loops: [[0, 1, 2]], windingRule: 'NONZERO' }],
};

describe('vector editing', () => {
  test('moving vertices keeps tangents', () => {
    const curve: VectorNetwork = { vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }], segments: [{ start: 0, end: 1, tangentStart: { x: 0, y: 5 }, tangentEnd: { x: 0, y: 5 } }], regions: [] };
    const moved = moveVertices(curve, [1], { x: 5, y: 5 });
    expect(moved.vertices[1]).toEqual({ x: 15, y: 5 });
    expect(moved.segments).toBe(curve.segments);
  });

  test('deleting a vertex removes its segments and the regions that relied on them', () => {
    const result = deleteVertices(triangle, [2]);
    expect(result.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(result.segments).toEqual([straightSegment(0, 1)]);
    expect(result.regions).toEqual([]);
  });

  test('splitting keeps the curve and closes region loops in their direction', () => {
    const curve: VectorNetwork = { vertices: [{ x: 0, y: 0 }, { x: 30, y: 0 }], segments: [{ start: 0, end: 1, tangentStart: { x: 0, y: -20 }, tangentEnd: { x: 0, y: -20 } }], regions: [] };
    const { network, vertex } = splitSegment(curve, 0, 0.25);
    expect(vertex).toBe(2);
    const original = segmentPoint(curve, 0, 0.625);
    // t = 0.625 on the original is t = 0.5 on the second half.
    const half = segmentPoint(network, 1, 0.5);
    expect(half.x).toBeCloseTo(original.x);
    expect(half.y).toBeCloseTo(original.y);

    // Split the reversed edge (2→1) of the triangle: the region still walks one closed loop through the new point.
    const split = splitSegment(triangle, 1, 0.5).network;
    expect(split.vertices[3]).toEqual({ x: 10, y: 5 });
    const commands = regionFillPath(split, split.regions[0]!);
    const points = commands.filter((c) => c.op === 'M' || c.op === 'L').map((c) => (c.op === 'M' || c.op === 'L' ? [c.x, c.y] : []));
    expect(points).toEqual([
      [0, 0],
      [10, 0],
      [10, 5],
      [10, 10],
      [0, 0],
    ]);
  });

  test('the nearest point on the segments', () => {
    const nearest = nearestOnSegments(triangle, { x: 12, y: 4 })!;
    expect(nearest.segment).toBe(1);
    expect(nearest.distance).toBeCloseTo(2);
    expect(segmentPoint(triangle, nearest.segment, nearest.t).y).toBeCloseTo(4);
    expect(nearestOnSegments({ vertices: [], segments: [], regions: [] }, { x: 0, y: 0 })).toBeNull();
  });
});
