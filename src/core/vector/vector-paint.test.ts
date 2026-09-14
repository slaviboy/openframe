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
import { regionAt, setRegionFills } from './vector-paint';
import { straightSegment, type VectorNetwork } from './vector-network';

/** Two squares side by side, 0–100 and 200–300, each its own region. */
const twoSquares: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 200, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 100 },
    { x: 200, y: 100 },
  ],
  segments: [
    straightSegment(0, 1),
    straightSegment(1, 2),
    straightSegment(2, 3),
    straightSegment(3, 0),
    straightSegment(4, 5),
    straightSegment(5, 6),
    straightSegment(6, 7),
    straightSegment(7, 4),
  ],
  regions: [
    { loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' },
    { loops: [[4, 5, 6, 7]], windingRule: 'NONZERO' },
  ],
};

const red = { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true } as unknown as Paint;

describe('paint regions', () => {
  test('finds the region under a point', () => {
    expect(regionAt(twoSquares, { x: 50, y: 50 })).toBe(0);
    expect(regionAt(twoSquares, { x: 250, y: 50 })).toBe(1);
    expect(regionAt(twoSquares, { x: 150, y: 50 })).toBeNull();
  });

  test("a ring's hole is outside its region", () => {
    // One region whose outer loop is the second square and whose inner loop is a square inside it.
    const ring: VectorNetwork = {
      vertices: [...twoSquares.vertices.slice(4), { x: 225, y: 25 }, { x: 275, y: 25 }, { x: 275, y: 75 }, { x: 225, y: 75 }],
      segments: [...[0, 1, 2, 3].map((i) => straightSegment(i, (i + 1) % 4)), ...[4, 5, 6, 7].map((i) => straightSegment(i, i === 7 ? 4 : i + 1))],
      regions: [{ loops: [[0, 1, 2, 3], [4, 5, 6, 7]], windingRule: 'EVENODD' }],
    };
    expect(regionAt(ring, { x: 210, y: 50 })).toBe(0);
    expect(regionAt(ring, { x: 250, y: 50 })).toBeNull();
  });

  test("setting a region's fills leaves the other regions alone, and clearing gives back the layer's fills", () => {
    const painted = setRegionFills(twoSquares, 1, [red]);
    expect(painted.regions[1]!.fills).toEqual([red]);
    expect(painted.regions[0]).toBe(twoSquares.regions[0]);
    const emptied = setRegionFills(painted, 1, []);
    expect(emptied.regions[1]!.fills).toEqual([]);
    const cleared = setRegionFills(painted, 1, undefined);
    expect(cleared.regions[1]).toEqual({ loops: [[4, 5, 6, 7]], windingRule: 'NONZERO' });
  });
});
