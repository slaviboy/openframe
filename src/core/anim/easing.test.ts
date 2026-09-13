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
import {
  bezierPreset,
  cubicBezierAt,
  evaluateEasing,
  springDurationMs,
  springPosition,
  springPreset,
} from './easing';

describe('cubic bezier', () => {
  test('linear is identity', () => {
    for (const x of [0, 0.1, 0.5, 0.9, 1]) expect(cubicBezierAt(0, 0, 1, 1, x)).toBeCloseTo(x, 6);
  });

  test('ease-in-out is symmetric around 0.5', () => {
    const e = bezierPreset('ease-in-and-out');
    expect(evaluateEasing(e, 0.5)).toBeCloseTo(0.5, 4);
    expect(evaluateEasing(e, 0.25) + evaluateEasing(e, 0.75)).toBeCloseTo(1, 4);
  });

  test('ease-out-back overshoots', () => {
    const e = bezierPreset('ease-out-back');
    const max = Math.max(...Array.from({ length: 101 }, (_, i) => evaluateEasing(e, i / 100)));
    expect(max).toBeGreaterThan(1);
  });

  test('is monotonic for ease-in', () => {
    const e = bezierPreset('ease-in');
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = evaluateEasing(e, i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });
});

describe('spring', () => {
  test('starts at 0 and settles at 1', () => {
    expect(springPosition(300, 20, 1, 0)).toBeCloseTo(0, 9);
    expect(springPosition(300, 20, 1, 5)).toBeCloseTo(1, 4);
  });

  test('bouncy overshoots, slow does not', () => {
    const peak = (e: ReturnType<typeof springPreset>) =>
      Math.max(...Array.from({ length: 200 }, (_, i) => evaluateEasing(e, i / 199)));
    expect(peak(springPreset('bouncy'))).toBeGreaterThan(1.05);
    expect(peak(springPreset('slow'))).toBeLessThan(1.02);
  });

  test('heavier mass takes longer', () => {
    expect(springDurationMs(300, 20, 3)).toBeGreaterThan(springDurationMs(300, 20, 1));
  });

  test('easing endpoints are exact', () => {
    const e = springPreset('quick');
    expect(evaluateEasing(e, 0)).toBe(0);
    expect(evaluateEasing(e, 1)).toBe(1);
  });
});

test('hold jumps at the end', () => {
  expect(evaluateEasing({ type: 'hold' }, 0.99)).toBe(0);
  expect(evaluateEasing({ type: 'hold' }, 1)).toBe(1);
});
