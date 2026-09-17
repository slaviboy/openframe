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
import { addWidthPoint, chainPointAt, nearestOnChain, profileOf, profileWidthPoints, snapPosition, strokeChain, variableWidthOutline, widthAt, WIDTH_PROFILES } from './vector-width';

const line: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  segments: [straightSegment(0, 1)],
  regions: [],
};

/** An open corner path from (0, 0) right to (100, 0), then down to (100, 100). */
const corner: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ],
  segments: [straightSegment(0, 1), straightSegment(1, 2)],
  regions: [],
};

describe('variable width strokes', () => {
  test('a path without branches becomes one ordered polyline with its vertex positions', () => {
    expect(strokeChain(line)).toEqual({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      lengths: [0, 100],
      vertexPositions: [0, 1],
      closed: false,
    });
    expect(strokeChain(corner)?.vertexPositions).toEqual([0, 0.5, 1]);
  });

  test('branching paths and networks of several paths have no chain', () => {
    const branching: VectorNetwork = { ...corner, vertices: [...corner.vertices, { x: 100, y: -100 }], segments: [...corner.segments, straightSegment(1, 3)] };
    expect(strokeChain(branching)).toBeNull();
    const two: VectorNetwork = { vertices: [...line.vertices, { x: 0, y: 50 }, { x: 100, y: 50 }], segments: [straightSegment(0, 1), straightSegment(2, 3)], regions: [] };
    expect(strokeChain(two)).toBeNull();
  });

  test('widths ease between points, hold beyond the first and last, and fall back to the stroke weight', () => {
    expect(widthAt([], 0.3, 4)).toBe(4);
    expect(widthAt([{ position: 0.5, width: 10 }], 0.1, 4)).toBe(10);
    const taper = [
      { position: 0, width: 2 },
      { position: 1, width: 10 },
    ];
    expect(widthAt(taper, 0.5, 4)).toBe(6);
    expect(widthAt(taper, 0.25, 4)).toBeCloseTo(2 + 8 * 0.15625);
  });

  test('the outline of an open path runs along one side and back along the other', () => {
    const outline = variableWidthOutline(
      strokeChain(line)!,
      [
        { position: 0, width: 2 },
        { position: 1, width: 10 },
      ],
      1,
    );
    expect(outline).toEqual([
      [
        { x: 0, y: 1 },
        { x: 100, y: 5 },
        { x: 100, y: -5 },
        { x: 0, y: -1 },
      ],
    ]);
  });

  test('positions: the nearest point, a point and its normal, snapping, and adding a width point in order', () => {
    const chain = strokeChain(corner)!;
    expect(nearestOnChain(chain, { x: 50, y: 10 })).toEqual({ position: 0.25, point: { x: 50, y: 0 }, distance: 10 });
    expect(chainPointAt(chain, 0.75)).toEqual({ point: { x: 100, y: 50 }, normal: { x: -1, y: 0 } });
    expect(snapPosition(chain, [], 0.26, 0.02)).toBe(0.25);
    expect(snapPosition(chain, [], 0.4, 0.02)).toBe(0.4);
    expect(
      snapPosition(
        chain,
        [
          { position: 0.6, width: 1 },
          { position: 0.9, width: 1 },
        ],
        0.74,
        0.02,
      ),
    ).toBe(0.75);
    expect(
      addWidthPoint(
        [
          { position: 0.2, width: 5 },
          { position: 0.8, width: 5 },
        ],
        0.5,
        7,
      ),
    ).toEqual({
      points: [
        { position: 0.2, width: 5 },
        { position: 0.5, width: 7 },
        { position: 0.8, width: 5 },
      ],
      index: 1,
    });
  });
});

describe('width profiles', () => {
  test('a profile lays down its points at the stroke’s own weight, and is read back', () => {
    const points = profileWidthPoints('taper-end', 10);
    expect(points).toEqual([
      { position: 0, width: 10 },
      { position: 1, width: 0.5 },
    ]);
    expect(profileOf(points, 10)).toBe('taper-end');
    // At another weight the same shape is laid down again, so the profile keeps its look.
    expect(profileOf(profileWidthPoints('taper-end', 4), 4)).toBe('taper-end');
  });

  test('no points at all is the uniform profile, and points of one’s own match none', () => {
    expect(profileOf([], 10)).toBe('uniform');
    expect(profileWidthPoints('uniform', 10)).toEqual([]);
    expect(profileOf([{ position: 0.3, width: 7 }], 10)).toBeNull();
  });

  test('every profile can be laid down and read back at a weight', () => {
    for (const profile of WIDTH_PROFILES) {
      expect(profileOf(profileWidthPoints(profile.id, 12), 12)).toBe(profile.id);
    }
  });
});
