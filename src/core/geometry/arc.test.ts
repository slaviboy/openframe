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
import { arcCommands, arcContains } from './arc';

const QUARTER = Math.PI / 2;

describe('ellipse arcs', () => {
  test('a clockwise three-quarter pie leaves its gap in the top-right quadrant', () => {
    const pie = { startingAngle: 0, endingAngle: 3 * QUARTER, innerRadius: 0 };
    expect(arcContains(100, 100, pie, { x: 80, y: 20 }, 0)).toBe(false);
    expect(arcContains(100, 100, pie, { x: 20, y: 80 }, 0)).toBe(true);
    expect(arcContains(100, 100, pie, { x: 80, y: 80 }, 0)).toBe(true);
    expect(arcContains(100, 100, pie, { x: 50, y: 50 }, 0)).toBe(true);
    expect(arcContains(100, 100, pie, { x: 101, y: 50 }, 0)).toBe(false);
  });

  test('a counter-clockwise sweep leaves its gap on the other side of the start', () => {
    const pie = { startingAngle: 0, endingAngle: -3 * QUARTER, innerRadius: 0 };
    expect(arcContains(100, 100, pie, { x: 80, y: 80 }, 0)).toBe(false);
    expect(arcContains(100, 100, pie, { x: 80, y: 20 }, 0)).toBe(true);
  });

  test('a ring leaves its middle empty', () => {
    const ring = { startingAngle: 0, endingAngle: 2 * Math.PI, innerRadius: 0.5 };
    expect(arcContains(100, 100, ring, { x: 50, y: 50 }, 0)).toBe(false);
    expect(arcContains(100, 100, ring, { x: 95, y: 50 }, 0)).toBe(true);
  });

  test('outlines: a full ellipse is four curves, a quarter pie returns to the center, a ring adds a reversed inner contour', () => {
    expect(arcCommands(100, 100, { startingAngle: 0, endingAngle: 2 * Math.PI, innerRadius: 0 }).map((c) => c.op)).toEqual(['M', 'C', 'C', 'C', 'C', 'Z']);
    expect(arcCommands(100, 100, { startingAngle: 0, endingAngle: QUARTER, innerRadius: 0 })).toMatchObject([
      { op: 'M', x: 100, y: 50 },
      { op: 'C', x: 50, y: 100 },
      { op: 'L', x: 50, y: 50 },
      { op: 'Z' },
    ]);
    expect(arcCommands(100, 100, { startingAngle: 0, endingAngle: 2 * Math.PI, innerRadius: 0.5 }).map((c) => c.op)).toEqual(['M', 'C', 'C', 'C', 'C', 'Z', 'M', 'C', 'C', 'C', 'C', 'Z']);
    expect(arcCommands(100, 100, { startingAngle: 1, endingAngle: 1, innerRadius: 0 })).toEqual([]);
  });
});
