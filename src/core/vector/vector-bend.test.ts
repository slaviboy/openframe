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
import { bendVertex, mirroredTangent, mirroringOf, moveHandles, oppositeEnd, setMirroring, setTangent, tangentAt, vertexEnds, vertexHandles } from './vector-bend';
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

describe('bend', () => {
  test('bending a corner gives the leaving segment the handle and the arriving one its mirror', () => {
    const bent = bendVertex(square, 1, { x: 20, y: -10 });
    expect(bent.segments[1]!.tangentStart).toEqual({ x: 20, y: -10 });
    expect(bent.segments[0]!.tangentEnd).toEqual({ x: -20, y: 10 });
    // Everything else is untouched.
    expect(bent.segments[2]).toEqual(square.segments[2]);
    expect(bent.regions).toBe(square.regions);
  });

  test('segments stored in either direction still get opposite handles', () => {
    const flipped: VectorNetwork = { ...square, segments: [straightSegment(1, 0), straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)] };
    const bent = bendVertex(flipped, 1, { x: 0, y: 30 });
    expect(bent.segments[0]!.tangentStart).toEqual({ x: 0, y: 30 });
    expect(bent.segments[1]!.tangentStart).toEqual({ x: 0, y: -30 });
  });

  test("an endpoint's segment curves toward the handle whether it arrives or leaves", () => {
    const open: VectorNetwork = { vertices: square.vertices.slice(0, 3), segments: [straightSegment(0, 1), straightSegment(1, 2)], regions: [] };
    expect(bendVertex(open, 2, { x: 10, y: 0 }).segments[1]!.tangentEnd).toEqual({ x: -10, y: 0 });
    expect(bendVertex(open, 0, { x: 10, y: 0 }).segments[0]!.tangentStart).toEqual({ x: 10, y: 0 });
  });

  test('handles are listed for the given vertices, and a path through a point has an opposite end', () => {
    const bent = bendVertex(square, 1, { x: 20, y: 0 });
    expect(vertexHandles(bent, [1])).toEqual([
      { end: { segment: 0, side: 'end' }, vertex: 1, point: { x: 80, y: 0 } },
      { end: { segment: 1, side: 'start' }, vertex: 1, point: { x: 120, y: 0 } },
    ]);
    expect(vertexHandles(bent, [0])).toEqual([]);
    expect(oppositeEnd(bent, { segment: 1, side: 'start' })).toEqual({ segment: 0, side: 'end' });
    const junction: VectorNetwork = { ...square, segments: [...square.segments, straightSegment(1, 3)] };
    expect(vertexEnds(junction, 1)).toHaveLength(3);
    expect(oppositeEnd(junction, { segment: 1, side: 'start' })).toBeNull();
  });

  test('setting one tangent leaves the rest of the network as it was', () => {
    const changed = setTangent(square, { segment: 2, side: 'end' }, { x: 5, y: 5 });
    expect(tangentAt(changed, { segment: 2, side: 'end' })).toEqual({ x: 5, y: 5 });
    expect(tangentAt(changed, { segment: 2, side: 'start' })).toEqual({ x: 0, y: 0 });
    expect(square.segments[2]!.tangentEnd).toEqual({ x: 0, y: 0 });
  });

  test('handles selected together move by the same amount, each once', () => {
    const bent = bendVertex(square, 1, { x: 20, y: 0 });
    const ends = [
      { segment: 0, side: 'end' },
      { segment: 1, side: 'start' },
      { segment: 1, side: 'start' },
    ] as const;
    const moved = moveHandles(bent, ends, { x: 0, y: 10 });
    expect(tangentAt(moved, ends[0])).toEqual({ x: -20, y: 10 });
    expect(tangentAt(moved, ends[1])).toEqual({ x: 20, y: 10 });
    expect(moved.segments[2]).toBe(bent.segments[2]);
  });
});

describe('handle mirroring', () => {
  /** A path through three points, bent at the middle one so its handles are exact opposites. */
  const bent = () =>
    bendVertex(
      {
        vertices: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 20, y: 0 },
        ],
        segments: [straightSegment(0, 1), straightSegment(1, 2)],
        regions: [],
      },
      1,
      { x: 4, y: 2 },
    );

  test('a point bent into a curve mirrors angle and length; a corner mirrors nothing', () => {
    expect(mirroringOf(bent(), 1)).toBe('ANGLE_AND_LENGTH');
    const straight: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      segments: [straightSegment(0, 1), straightSegment(1, 2)],
      regions: [],
    };
    expect(mirroringOf(straight, 1)).toBe('NONE');
  });

  test('mirror angle turns the other handle around but leaves its length', () => {
    const other = { x: -2, y: 0 };
    const followed = mirroredTangent('ANGLE', { x: 0, y: 6 }, other)!;
    expect(Math.hypot(followed.x, followed.y)).toBeCloseTo(2, 6);
    expect(followed).toMatchObject({ x: 0 });
    expect(followed.y).toBeCloseTo(-2, 6);
  });

  test('mirror angle and length makes the other handle the exact opposite; no mirroring leaves it', () => {
    expect(mirroredTangent('ANGLE_AND_LENGTH', { x: 3, y: -4 }, { x: 1, y: 1 })).toEqual({ x: -3, y: 4 });
    expect(mirroredTangent('NONE', { x: 3, y: -4 }, { x: 1, y: 1 })).toBeNull();
  });

  test('a mirroring set on a point is what is read back, and clearing it reads the handles again', () => {
    const set = setMirroring(bent(), [1], 'NONE');
    expect(mirroringOf(set, 1)).toBe('NONE');
    expect(set.vertices[1]).toMatchObject({ mirror: 'NONE' });
    const cleared = setMirroring(set, [1], undefined);
    expect(cleared.vertices[1]).not.toHaveProperty('mirror');
    expect(mirroringOf(cleared, 1)).toBe('ANGLE_AND_LENGTH');
  });
});
