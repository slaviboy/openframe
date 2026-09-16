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
import { dynamicStrokePath, hasDynamicStroke } from './dynamic-stroke';

/** A straight line along x, 200 units long. */
const line: PathCommand[] = [
  { op: 'M', x: 0, y: 0 },
  { op: 'L', x: 200, y: 0 },
];

const square: PathCommand[] = [
  { op: 'M', x: 0, y: 0 },
  { op: 'L', x: 100, y: 0 },
  { op: 'L', x: 100, y: 100 },
  { op: 'L', x: 0, y: 100 },
  { op: 'Z' },
];

const offsets = (commands: readonly PathCommand[]) => commands.flatMap((c) => (c.op === 'L' || c.op === 'M' ? [c.y] : []));

describe('a dynamic stroke', () => {
  test('leaves the path alone without bumps or height', () => {
    expect(hasDynamicStroke(undefined)).toBe(false);
    expect(hasDynamicStroke({ frequency: 0, wiggle: 50, smoothen: 0 })).toBe(false);
    expect(hasDynamicStroke({ frequency: 50, wiggle: 0, smoothen: 0 })).toBe(false);
    expect(dynamicStrokePath(line, { frequency: 0, wiggle: 50, smoothen: 0 })).toEqual(line);
  });

  test('moves the path sideways, within the height Wiggle asks for', () => {
    const bumpy = dynamicStrokePath(line, { frequency: 50, wiggle: 50, smoothen: 50 });
    const ys = offsets(bumpy);
    // A horizontal line moves only in y, by at most Wiggle's share of the largest offset (12 units).
    expect(Math.max(...ys.map(Math.abs))).toBeGreaterThan(0);
    expect(Math.max(...ys.map(Math.abs))).toBeLessThanOrEqual(6.001);
    expect(bumpy.length).toBeGreaterThan(line.length);
    // Its ends stay on the path's own line, give or take the offset there.
    expect(bumpy[0]!.op).toBe('M');
  });

  test('Wiggle scales how far the bumps go, and Frequency how many there are', () => {
    const small = Math.max(...offsets(dynamicStrokePath(line, { frequency: 50, wiggle: 20, smoothen: 50 })).map(Math.abs));
    const large = Math.max(...offsets(dynamicStrokePath(line, { frequency: 50, wiggle: 80, smoothen: 50 })).map(Math.abs));
    expect(large).toBeGreaterThan(small * 2);

    // More bumps means the offset changes direction more often.
    const turns = (frequency: number) => {
      const ys = offsets(dynamicStrokePath(line, { frequency, wiggle: 60, smoothen: 0 }));
      let count = 0;
      for (let i = 2; i < ys.length; i++) if (Math.sign(ys[i]! - ys[i - 1]!) !== Math.sign(ys[i - 1]! - ys[i - 2]!)) count++;
      return count;
    };
    expect(turns(80)).toBeGreaterThan(turns(20));
  });

  test('is the same every time, so a redraw does not shift the stroke', () => {
    const once = dynamicStrokePath(line, { frequency: 40, wiggle: 40, smoothen: 20 });
    const again = dynamicStrokePath(line, { frequency: 40, wiggle: 40, smoothen: 20 });
    expect(again).toEqual(once);
  });

  test('keeps a closed path closed, meeting itself where it started', () => {
    const bumpy = dynamicStrokePath(square, { frequency: 60, wiggle: 40, smoothen: 60 });
    expect(bumpy.at(-1)).toEqual({ op: 'Z' });
    const points = bumpy.filter((c): c is Extract<PathCommand, { x: number }> => c.op === 'M' || c.op === 'L');
    expect(points.at(-1)!.x).toBeCloseTo(points[0]!.x, 6);
    expect(points.at(-1)!.y).toBeCloseTo(points[0]!.y, 6);
  });
});
