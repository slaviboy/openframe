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
import { connectedComponents, cutAlongLine, lineCrossings, splitComponents } from './vector-divide';
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

/** A cut straight down the middle of the square, past both edges. */
const [a, b] = [
  { x: 50, y: -20 },
  { x: 50, y: 120 },
];

describe('dividing with the Cut tool', () => {
  test('a cut crosses the edges it passes over, only within the drag', () => {
    const crossings = lineCrossings(square, a, b);
    expect(crossings.map((c) => c.segment)).toEqual([0, 2]);
    for (const c of crossings) expect(c.t).toBeCloseTo(0.5, 6);
    // A drag that stops before reaching the square crosses nothing.
    expect(lineCrossings(square, a, { x: 50, y: -10 })).toEqual([]);
  });

  test('cutting along the line breaks the outline into two open pieces, the first holding the first point', () => {
    const { network, cuts } = cutAlongLine(square, a, b);
    expect(cuts).toBe(2);
    expect(network.vertices).toHaveLength(8);
    expect(network.segments).toHaveLength(6);
    expect(network.regions).toEqual([]);
    expect(connectedComponents(network)).toHaveLength(2);

    const parts = splitComponents(network);
    expect(parts.map((p) => p.segments.length)).toEqual([3, 3]);
    const xs = (p: VectorNetwork) => p.vertices.map((v) => Math.round(v.x));
    expect(parts[0]!.vertices[0]).toEqual({ x: 0, y: 0 });
    expect([Math.min(...xs(parts[0]!)), Math.max(...xs(parts[0]!))]).toEqual([0, 50]);
    expect([Math.min(...xs(parts[1]!)), Math.max(...xs(parts[1]!))]).toEqual([50, 100]);
  });

  test('a cut that crosses nothing leaves the network as it is, and one piece keeps its region', () => {
    expect(cutAlongLine(square, { x: -50, y: 0 }, { x: -50, y: 100 })).toEqual({ network: square, cuts: 0 });
    expect(splitComponents(square)).toEqual([square]);
  });
});
