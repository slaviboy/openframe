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
import { healVertices } from './vector-edit';
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

describe('delete and heal', () => {
  test('healing a corner of a closed square joins its sides into a filled triangle', () => {
    const healed = healVertices(square, [1]);
    expect(healed.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(healed.segments).toEqual([straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 0)]);
    expect(healed.regions).toEqual([{ loops: [[0, 1, 2]], windingRule: 'NONZERO' }]);
  });

  test('healing two corners works whichever direction the segments are stored in', () => {
    const flipped: VectorNetwork = { ...square, segments: [straightSegment(1, 0), straightSegment(1, 2), straightSegment(3, 2), straightSegment(3, 0)] };
    const healed = healVertices(flipped, [1, 3]);
    expect(healed.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
    // Two points left: the square collapses to two segments between them, still one loop.
    expect(healed.segments).toEqual([straightSegment(0, 1), straightSegment(1, 0)]);
    expect(healed.regions).toEqual([{ loops: [[0, 1]], windingRule: 'NONZERO' }]);
  });

  test('curves keep their outer handle directions, lengthened to the joined length', () => {
    const arc: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
      ],
      segments: [
        { start: 0, end: 1, tangentStart: { x: 0, y: 20 }, tangentEnd: { x: -20, y: 0 } },
        // Stored backwards: from the right-hand end to the middle.
        { start: 2, end: 1, tangentStart: { x: 0, y: 20 }, tangentEnd: { x: 20, y: 0 } },
      ],
      regions: [],
    };
    const healed = healVertices(arc, [1]);
    expect(healed.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(healed.segments).toHaveLength(1);
    const [joined] = healed.segments;
    expect([joined!.start, joined!.end]).toEqual([0, 1]);
    // Each half was √2·50 long and the joined path is twice that: both handles double.
    expect(joined!.tangentStart.x).toBeCloseTo(0);
    expect(joined!.tangentStart.y).toBeCloseTo(40);
    expect(joined!.tangentEnd.x).toBeCloseTo(0);
    expect(joined!.tangentEnd.y).toBeCloseTo(40);
  });

  test('an endpoint is deleted with its segment', () => {
    const open: VectorNetwork = { vertices: square.vertices.slice(0, 3), segments: [straightSegment(0, 1), straightSegment(1, 2)], regions: [] };
    const healed = healVertices(open, [2]);
    expect(healed.vertices).toHaveLength(2);
    expect(healed.segments).toEqual([straightSegment(0, 1)]);
  });
});
