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
import { rulerStep, rulerTicks } from './rulers';

describe('rulers', () => {
  test('steps are 1/2/5 × 10ⁿ and keep labels at least minPx apart', () => {
    expect(rulerStep(1)).toBe(50);
    expect(rulerStep(2)).toBe(50);
    expect(rulerStep(0.5)).toBe(100);
    expect(rulerStep(0.1)).toBe(500);
    expect(rulerStep(8)).toBe(10);
    expect(rulerStep(100)).toBe(0.5);
    for (const zoom of [0.02, 0.37, 1, 3.3, 64]) expect(rulerStep(zoom) * zoom).toBeGreaterThanOrEqual(50 - 1e-9);
  });

  test('ticks cover the visible range with labeled majors and subdivided minors', () => {
    const ticks = rulerTicks(-100, 1, 300);
    const majors = ticks.filter((t) => t.label !== null);
    expect(majors.map((t) => t.label)).toEqual(['-100', '-50', '0', '50', '100', '150']);
    expect(majors[0]!.screen).toBe(0);
    // Fifths of 50 at zoom 1 are 10px apart.
    expect(ticks[1]!.world).toBe(-90);
    expect(ticks.every((t) => t.screen >= 0 && t.screen < 300)).toBe(true);
  });

  test('labels avoid float noise and negative zero', () => {
    const labels = rulerTicks(-0.3, 100, 100).filter((t) => t.label).map((t) => t.label);
    expect(labels).toEqual(['0', '0.5']);
    expect(rulerTicks(0.1, 1000, 500).find((t) => t.label)?.label).toBe('0.1');
  });
});
