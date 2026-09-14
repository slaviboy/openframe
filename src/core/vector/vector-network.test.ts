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
import { networkBounds, networkOutlines, networkStrokePath, regionFillPath, straightSegment, transformNetwork, transformNetworkBy, type VectorNetwork } from './vector-network';

const square: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
  segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)],
  regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' }],
};

describe('vector networks', () => {
  test('a closed loop strokes as one closed subpath and fills its region', () => {
    expect(networkStrokePath(square)).toEqual([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 10, y: 0 },
      { op: 'L', x: 10, y: 10 },
      { op: 'L', x: 0, y: 10 },
      { op: 'L', x: 0, y: 0 },
      { op: 'Z' },
    ]);
    expect(regionFillPath(square, square.regions[0]!)).toEqual([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 10, y: 0 },
      { op: 'L', x: 10, y: 10 },
      { op: 'L', x: 0, y: 10 },
      { op: 'L', x: 0, y: 0 },
      { op: 'Z' },
    ]);
  });

  test('branches and open paths draw every segment once, starting from open ends', () => {
    // A "T": a horizontal line 0–1–2 with a branch 1–3; segments listed out of order and reversed.
    const t: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 10, y: 10 },
      ],
      segments: [straightSegment(3, 1), straightSegment(2, 1), straightSegment(0, 1)],
      regions: [],
    };
    const commands = networkStrokePath(t);
    expect(commands.filter((c) => c.op === 'L')).toHaveLength(3);
    expect(commands.filter((c) => c.op === 'Z')).toHaveLength(0);
    expect(commands[0]).toEqual({ op: 'M', x: 10, y: 10 });
  });

  test('curved segments use their tangents; bounds include curve extrema but not control points', () => {
    const arc: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
      ],
      segments: [{ start: 0, end: 1, tangentStart: { x: 0, y: -20 }, tangentEnd: { x: 0, y: -20 } }],
      regions: [],
    };
    expect(networkStrokePath(arc)[1]).toEqual({ op: 'C', x1: 0, y1: -20, x2: 30, y2: -20, x: 30, y: 0 });
    // The curve peaks at t = 0.5: y = 0.75 × (−20) = −15.
    expect(networkBounds(arc)).toEqual({ x: 0, y: -15, width: 30, height: 15 });
  });

  test('transform moves the origin to zero and scales coordinates and tangents', () => {
    const moved = transformNetwork(
      { vertices: [{ x: 5, y: 5 }, { x: 15, y: 25 }], segments: [{ start: 0, end: 1, tangentStart: { x: 2, y: 0 }, tangentEnd: { x: 0, y: -4 } }], regions: [] },
      { x: 5, y: 5 },
      2,
      0.5,
    );
    expect(moved.vertices).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 10 },
    ]);
    expect(moved.segments[0]).toMatchObject({ tangentStart: { x: 4, y: 0 }, tangentEnd: { x: 0, y: -2 } });
  });

  test('outlines flatten region loops into polygons and strokes into polylines', () => {
    const outlines = networkOutlines(square);
    expect(outlines.fills).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
      ],
    ]);
    expect(outlines.strokes).toHaveLength(1);
    expect(outlines.strokes[0]!.closed).toBe(true);
  });

  test('an affine transform moves vertices and rotates tangents', () => {
    const turned = transformNetworkBy(
      { vertices: [{ x: 10, y: 0 }], segments: [{ start: 0, end: 0, tangentStart: { x: 1, y: 0 }, tangentEnd: { x: 0, y: 0 } }], regions: [] },
      { a: 0, b: 1, c: -1, d: 0, e: 5, f: 5 },
    );
    expect(turned.vertices[0]).toEqual({ x: 5, y: 15 });
    expect(turned.segments[0]!.tangentStart).toEqual({ x: 0, y: 1 });
  });
});
