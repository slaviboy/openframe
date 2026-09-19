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
import { capOfEnd, chainVertices, isMarkerCap, openEnds, pathEnds } from './vector-caps';

/** An open path from (0, 0) right to (100, 0), then down to (100, 100). */
const corner: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ],
  segments: [straightSegment(0, 1), straightSegment(1, 2)],
  regions: [],
};

const closed: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ],
  segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 0)],
  regions: [],
};

/** The corner path with a third arm off its middle point, so the middle joins three segments. */
const branching: VectorNetwork = {
  ...corner,
  vertices: [...corner.vertices, { x: 100, y: -100 }],
  segments: [...corner.segments, straightSegment(1, 3)],
};

describe('the open ends of a path', () => {
  test('an end is a point one segment reaches, pointing away from the path', () => {
    const ends = openEnds(corner);
    expect(ends.map((end) => end.vertex)).toEqual([0, 2]);
    // The path leaves (0, 0) to the right, so its start points left; it arrives at (100, 100) going down.
    expect(ends[0]!.angle).toBeCloseTo(Math.PI);
    expect(ends[1]!.angle).toBeCloseTo(Math.PI / 2);
    expect(ends[1]!.point).toEqual({ x: 100, y: 100 });
  });

  test('a curve ends the way its handle leaves the point', () => {
    const curved: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      // The path leaves (0, 0) straight down, so the end points straight up.
      segments: [{ start: 0, end: 1, tangentStart: { x: 0, y: 40 }, tangentEnd: { x: 0, y: 0 } }],
      regions: [],
    };
    expect(openEnds(curved)[0]!.angle).toBeCloseTo(-Math.PI / 2);
  });

  test('a closed path has no ends, and a branching one keeps only the points one segment reaches', () => {
    expect(openEnds(closed)).toEqual([]);
    expect(openEnds(branching).map((end) => end.vertex)).toEqual([0, 2, 3]);
  });

  test('one unbranched path is walked from end to end; anything else has no start and end of its own', () => {
    expect(chainVertices(corner)).toEqual([0, 1, 2]);
    expect(pathEnds(corner)).toMatchObject({ start: { vertex: 0 }, end: { vertex: 2 } });
    expect(chainVertices(closed)).toEqual([0, 1, 2]);
    expect(pathEnds(closed)).toBeNull();
    expect(chainVertices(branching)).toBeNull();
    expect(pathEnds(branching)).toBeNull();
    const two: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 50 },
        { x: 10, y: 50 },
      ],
      segments: [straightSegment(0, 1), straightSegment(2, 3)],
      regions: [],
    };
    expect(chainVertices(two)).toBeNull();
  });

  test('an end draws its own cap, or the layer default for the ends that carry none', () => {
    expect(capOfEnd({ x: 0, y: 0, cap: 'TRIANGLE_ARROW' }, 'ROUND')).toBe('TRIANGLE_ARROW');
    expect(capOfEnd({ x: 0, y: 0 }, 'ROUND')).toBe('ROUND');
    expect(capOfEnd({ x: 0, y: 0 }, undefined)).toBe('NONE');
    expect(capOfEnd(undefined, undefined)).toBe('NONE');
  });

  test('only the ends drawn as their own artwork are markers', () => {
    expect(['NONE', 'ROUND', 'SQUARE'].map((cap) => isMarkerCap(cap as 'NONE'))).toEqual([false, false, false]);
    expect(['LINE_ARROW', 'TRIANGLE_ARROW', 'TRIANGLE_FILLED', 'CIRCLE_FILLED', 'DIAMOND_FILLED'].map((cap) => isMarkerCap(cap as 'LINE_ARROW'))).toEqual([true, true, true, true, true]);
  });
});
