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
import { springPreset } from './easing';
import { clampHandle, curveRange, easingCurve } from './easing-curve';

describe('easing graphs', () => {
  test('a curve runs from the start to the end of the animation over its time', () => {
    const linear = easingCurve({ type: 'bezier', x1: 0, y1: 0, x2: 1, y2: 1 }, 4);
    expect(linear.map((p) => p.t)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    linear.forEach((p) => expect(p.value).toBeCloseTo(p.t, 2));
    expect(curveRange(linear)).toEqual({ min: 0, max: 1 });
  });

  test('a bouncy spring overshoots, and the graph widens to show it', () => {
    const range = curveRange(easingCurve(springPreset('bouncy')));
    expect(range.max).toBeGreaterThan(1);
    expect(range.min).toBe(0);
  });

  test('dragged Bézier handles stay within the graph, to two decimals', () => {
    expect(clampHandle(1.234, -2)).toEqual({ x: 1, y: -0.5 });
    expect(clampHandle(0.333, 0.777)).toEqual({ x: 0.33, y: 0.78 });
  });
});
