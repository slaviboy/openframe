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
import { arcToCubics, parseSvgPath } from './svg-path-parse';

const end = (command: PathCommand | undefined) => (command && command.op !== 'Z' ? { x: command.x, y: command.y } : null);

describe('SVG path data', () => {
  test('moves, lines, horizontal and vertical lines and closes, absolute and relative', () => {
    expect(parseSvgPath('M0 0L10 0H20V10h-5v5Z')).toEqual([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 10, y: 0 },
      { op: 'L', x: 20, y: 0 },
      { op: 'L', x: 20, y: 10 },
      { op: 'L', x: 15, y: 10 },
      { op: 'L', x: 15, y: 15 },
      { op: 'Z' },
    ]);
    // Coordinate pairs after a move are lines; a close returns to the subpath's start.
    expect(parseSvgPath('m1 1 2 2zl1 0')).toEqual([
      { op: 'M', x: 1, y: 1 },
      { op: 'L', x: 3, y: 3 },
      { op: 'Z' },
      { op: 'L', x: 2, y: 1 },
    ]);
  });

  test('compact numbers and separators', () => {
    expect(parseSvgPath('M1.5.5L2,2-3-4')).toEqual([
      { op: 'M', x: 1.5, y: 0.5 },
      { op: 'L', x: 2, y: 2 },
      { op: 'L', x: -3, y: -4 },
    ]);
    expect(parseSvgPath('M1e1 2E-1')).toEqual([{ op: 'M', x: 10, y: 0.2 }]);
  });

  test('smooth cubics reflect the previous control point; quadratics become cubics', () => {
    const [, , smooth] = parseSvgPath('M0 0C0 10 10 10 10 0S20 -10 20 0');
    expect(smooth).toEqual({ op: 'C', x1: 10, y1: -10, x2: 20, y2: -10, x: 20, y: 0 });

    const [, quad, reflected] = parseSvgPath('M0 0Q10 10 20 0T40 0');
    expect(quad).toMatchObject({ op: 'C', x: 20, y: 0 });
    expect((quad as Extract<PathCommand, { op: 'C' }>).x1).toBeCloseTo(20 / 3);
    expect((quad as Extract<PathCommand, { op: 'C' }>).y1).toBeCloseTo(20 / 3);
    expect((quad as Extract<PathCommand, { op: 'C' }>).x2).toBeCloseTo(40 / 3);
    // T reflects (10, 10) about (20, 0) to (30, −10).
    expect((reflected as Extract<PathCommand, { op: 'C' }>).y1).toBeCloseTo(-20 / 3);
  });

  test('elliptical arcs become quarter-turn cubics through the arc', () => {
    const commands = parseSvgPath('M0 0A10 10 0 0 1 20 0');
    expect(commands).toHaveLength(3);
    expect(end(commands[1])!.x).toBeCloseTo(10);
    expect(end(commands[1])!.y).toBeCloseTo(-10);
    expect(end(commands[2])).toEqual({ x: 20, y: 0 });
    // Compact flags read the same as separated ones.
    expect(parseSvgPath('M0 0a5 5 0 1010 0')).toEqual(parseSvgPath('M0,0 a5,5 0 1,0 10,0'));
    // Radii too small to reach the end point are scaled up; a zero radius is a line.
    expect(end(arcToCubics(0, 0, 1, 1, 0, false, true, 20, 0).at(-1))).toEqual({ x: 20, y: 0 });
    expect(arcToCubics(0, 0, 0, 5, 0, false, true, 20, 0)).toEqual([{ op: 'L', x: 20, y: 0 }]);
    expect(arcToCubics(5, 5, 3, 3, 0, false, true, 5, 5)).toEqual([]);
  });

  test('malformed data keeps what came before; data not starting with a move gives nothing', () => {
    expect(parseSvgPath('M0 0L10')).toEqual([{ op: 'M', x: 0, y: 0 }]);
    expect(parseSvgPath('M0 0L10 10X5')).toEqual([
      { op: 'M', x: 0, y: 0 },
      { op: 'L', x: 10, y: 10 },
    ]);
    expect(parseSvgPath('L10 10')).toEqual([]);
    expect(parseSvgPath('')).toEqual([]);
  });
});
