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
import { contoursOf, faceAt, pointInCommands, regionShapes } from './shape-builder';
import { straightSegment, type VectorNetwork } from './vector-network';

/** A square from (x, y), `size` across. */
const square = (x: number, y: number, size: number): PathCommand[] => [{ op: 'M', x, y }, { op: 'L', x: x + size, y }, { op: 'L', x: x + size, y: y + size }, { op: 'L', x, y: y + size }, { op: 'Z' }];

describe('shape builder pieces', () => {
  test('a point is inside a shape, outside it, and outside the hole in it', () => {
    expect(pointInCommands(square(0, 0, 10), { x: 5, y: 5 })).toBe(true);
    expect(pointInCommands(square(0, 0, 10), { x: 15, y: 5 })).toBe(false);
    // A shape with a smaller square inside it: the inner one is a hole, so its middle is outside the area.
    const ring = [...square(0, 0, 20), ...square(5, 5, 10)];
    expect(pointInCommands(ring, { x: 2, y: 10 })).toBe(true);
    expect(pointInCommands(ring, { x: 10, y: 10 })).toBe(false);
  });

  test('contours are split at each move and close', () => {
    expect(contoursOf([...square(0, 0, 10), ...square(20, 0, 10)])).toHaveLength(2);
  });

  test('the piece under a point is the last one drawn that covers it', () => {
    const faces = [
      { members: [0], commands: square(0, 0, 10) },
      { members: [0, 1], commands: square(5, 0, 10) },
    ];
    expect(faceAt(faces, { x: 2, y: 5 })).toBe(0);
    expect(faceAt(faces, { x: 7, y: 5 })).toBe(1);
    expect(faceAt(faces, { x: 50, y: 50 })).toBeNull();
  });

  test('a network gives up one shape per closed region', () => {
    const network: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      segments: [straightSegment(0, 1), straightSegment(1, 2), straightSegment(2, 3), straightSegment(3, 0)],
      regions: [{ loops: [[0, 1, 2, 3]], windingRule: 'NONZERO' }],
    };
    const shapes = regionShapes(network);
    expect(shapes).toHaveLength(1);
    expect(pointInCommands(shapes[0]!, { x: 5, y: 5 })).toBe(true);
  });
});
