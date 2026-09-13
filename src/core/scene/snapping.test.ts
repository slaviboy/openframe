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
import { edgeValues, guidesFor, snapBounds, snapValue } from './snapping';

describe('snapBounds', () => {
  const big = { x: 0, y: 0, width: 50, height: 50 };
  const small = { x: 120, y: 0, width: 10, height: 10 };

  test('snaps the nearest edge or center on each axis and reports merged guides', () => {
    const result = snapBounds({ x: 97, y: 2, width: 20, height: 20 }, [big, small], 5);
    // Right edge 117 → small's left 120 (3px); top 2 → top 0 (−2px).
    expect(result.dx).toBe(3);
    expect(result.dy).toBe(-2);
    const vertical = result.guides.find((g) => g.axis === 'x' && g.position === 120);
    expect(vertical).toEqual({ axis: 'x', position: 120, from: 0, to: 20 });
    const horizontal = result.guides.find((g) => g.axis === 'y' && g.position === 0);
    expect(horizontal).toEqual({ axis: 'y', position: 0, from: 0, to: 130 });
  });

  test('centers snap to centers', () => {
    const result = snapBounds({ x: 12, y: 200, width: 30, height: 10 }, [big], 5);
    // Moving center x 27 → big center 25.
    expect(result.dx).toBe(-2);
    expect(result.dy).toBe(0);
  });

  test('distance equal to the threshold does not snap; disabled axes never snap', () => {
    expect(snapBounds({ x: 55, y: 300, width: 10, height: 10 }, [big], 5).dx).toBe(0);
    const locked = snapBounds({ x: 52, y: 1, width: 10, height: 10 }, [big], 5, { x: false, y: true });
    expect(locked.dx).toBe(0);
    expect(locked.dy).toBe(-1);
    expect(locked.guides.every((g) => g.axis === 'y')).toBe(true);
  });

  test('no targets, no snap', () => {
    expect(snapBounds({ x: 1, y: 1, width: 1, height: 1 }, [], 5)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});

describe('snapValue and guidesFor', () => {
  test('snapValue picks the nearest candidate strictly within the threshold', () => {
    expect(snapValue(97, [0, 50, 100], 5)).toBe(3);
    expect(snapValue(52, [50, 55], 5)).toBe(-2);
    expect(snapValue(95, [100], 5)).toBeNull();
    expect(snapValue(1, [], 5)).toBeNull();
  });

  test('edgeValues lists edges and centers; guidesFor reports only requested axes', () => {
    const target = { x: 100, y: 0, width: 50, height: 50 };
    expect(edgeValues([target], 'x')).toEqual([100, 125, 150]);
    const rect = { x: 50, y: 0, width: 50, height: 20 };
    expect(guidesFor(rect, [target], { x: true, y: false })).toEqual([{ axis: 'x', position: 100, from: 0, to: 50 }]);
    expect(guidesFor(rect, [target], { x: false, y: false })).toEqual([]);
  });
});
