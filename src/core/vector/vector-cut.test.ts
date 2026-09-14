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
import { cutVertex } from './vector-edit';
import { straightSegment, type VectorNetwork } from './vector-network';

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

describe('cut', () => {
  test('cutting a corner of a closed square gives the second side its own end and removes the fill', () => {
    const { network, vertices } = cutVertex(square, 1);
    expect(vertices).toEqual([1, 4]);
    expect(network.vertices[4]).toEqual({ x: 100, y: 0 });
    expect(network.segments[0]).toEqual(straightSegment(0, 1));
    expect(network.segments[1]).toEqual(straightSegment(4, 2));
    expect(network.regions).toEqual([]);
  });

  test('an endpoint has nothing to cut', () => {
    const open: VectorNetwork = { vertices: square.vertices.slice(0, 3), segments: [straightSegment(0, 1), straightSegment(1, 2)], regions: [] };
    const result = cutVertex(open, 2);
    expect(result.network).toBe(open);
    expect(result.vertices).toEqual([2]);
  });

  test('a segment that starts and ends at the vertex is opened', () => {
    const loop: VectorNetwork = {
      vertices: [{ x: 0, y: 0 }],
      segments: [{ start: 0, end: 0, tangentStart: { x: 50, y: -50 }, tangentEnd: { x: -50, y: -50 } }],
      regions: [{ loops: [[0]], windingRule: 'NONZERO' }],
    };
    const { network, vertices } = cutVertex(loop, 0);
    expect(vertices).toEqual([0, 1]);
    expect(network.segments[0]).toMatchObject({ start: 0, end: 1 });
    expect(network.regions).toEqual([]);
  });

  test('regions that do not use the cut segments keep their fill', () => {
    // Two squares sharing nothing: cutting the first leaves the second region.
    const second: VectorNetwork = {
      vertices: [...square.vertices, ...square.vertices.map((p) => ({ x: p.x + 200, y: p.y }))],
      segments: [...square.segments, straightSegment(4, 5), straightSegment(5, 6), straightSegment(6, 7), straightSegment(7, 4)],
      regions: [square.regions[0]!, { loops: [[4, 5, 6, 7]], windingRule: 'NONZERO' }],
    };
    expect(cutVertex(second, 0).network.regions).toEqual([{ loops: [[4, 5, 6, 7]], windingRule: 'NONZERO' }]);
  });
});
