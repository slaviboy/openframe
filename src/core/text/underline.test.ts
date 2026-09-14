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
import { fallbackUnderlineMetrics, underlineLine, wavySegments } from './underline';

describe('underline geometry', () => {
  test('thickness and offset follow the settings, defaulting to the font', () => {
    const metrics = { position: 3, thickness: 2 };
    expect(underlineLine(50, metrics, null, 0)).toEqual({ y: 54, thickness: 2 });
    expect(underlineLine(50, metrics, 4, 0)).toEqual({ y: 55, thickness: 4 });
    expect(underlineLine(50, metrics, null, -2)).toEqual({ y: 52, thickness: 2 });
    expect(fallbackUnderlineMetrics(32)).toEqual({ position: 32 * 0.17, thickness: 2 });
  });

  test('a wavy line alternates up and down and ends exactly at x2', () => {
    const segments = wavySegments(0, 10, 20, 1);
    expect(segments).toHaveLength(5);
    // The control point is twice the wave's height (1.2 px) above the line: a quadratic curve peaks halfway to it.
    expect(segments[0]).toEqual([1, 17.6, 2, 20]);
    expect(segments[1]![1]).toBeGreaterThan(20);
    expect(segments.at(-1)![2]).toBe(10);
  });
});
