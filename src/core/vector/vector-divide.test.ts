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
import type { PathCommand } from '../geometry/corners';
import type { Paint } from '../schema/document';
import { connectedComponents, cutAlongLine, divideNetwork, lineCrossings, splitComponents } from './vector-divide';
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

  describe('divideNetwork', () => {
    const red = { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true } as unknown as Paint;
    const filled: VectorNetwork = { ...square, regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO', fills: [red] }] };
    const rect = (x0: number, x1: number): PathCommand[] => [
      { op: 'M', x: x0, y: 0 },
      { op: 'L', x: x1, y: 0 },
      { op: 'L', x: x1, y: 100 },
      { op: 'L', x: x0, y: 100 },
      { op: 'Z' },
    ];

    test('a filled region the drag crosses splits into its two sides, the side with the first point first, each keeping the fills', () => {
      // For a drag straight down x = 50, the positive side is x < 50, where the first point (0, 0) is.
      const pieces = divideNetwork(filled, a, b, () => ({ positive: rect(0, 50), negative: rect(50, 100) }))!;
      expect(pieces.map((p) => Math.max(...p.vertices.map((v) => v.x)))).toEqual([50, 100]);
      expect(pieces.every((p) => p.regions.length === 1 && p.regions[0]!.fills?.[0] === red)).toBe(true);
    });

    test('without the engine the outline is cut open as before, and a drag that crosses nothing divides nothing', () => {
      expect(divideNetwork(filled, a, b, () => null)!.map((p) => p.segments.length)).toEqual([3, 3]);
      expect(divideNetwork(filled, { x: -50, y: 0 }, { x: -50, y: 100 }, () => null)).toBeNull();
    });
  });
});
