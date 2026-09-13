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
import { detectSmartSelection, respace, spacingHandles } from './smart-selection';

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('smart selection', () => {
  test('a row with equal gaps is detected regardless of input order and sizes', () => {
    const rects = [r(120, 0, 40, 60), r(0, 0, 50, 50), r(70, 10, 30, 30)];
    expect(detectSmartSelection(rects)).toEqual({ axis: 'x', order: [1, 2, 0], gap: 20 });
  });

  test('columns are detected; unequal gaps, missing overlap or a single layer are not smart', () => {
    expect(detectSmartSelection([r(0, 0, 50, 20), r(10, 30, 40, 20), r(0, 60, 50, 20)])).toMatchObject({ axis: 'y', gap: 10 });
    expect(detectSmartSelection([r(0, 0, 10, 10), r(20, 0, 10, 10), r(45, 0, 10, 10)])).toBeNull();
    expect(detectSmartSelection([r(0, 0, 10, 10), r(20, 50, 10, 10)])).toBeNull();
    expect(detectSmartSelection([r(0, 0, 10, 10)])).toBeNull();
    // Gaps within half a pixel still count as equal.
    expect(detectSmartSelection([r(0, 0, 10, 10), r(20, 0, 10, 10), r(40.4, 0, 10, 10)])).not.toBeNull();
  });

  test('respace keeps the first layer and the cross positions', () => {
    const rects = [r(0, 0, 50, 50), r(70, 10, 30, 30), r(120, 0, 40, 60)];
    const selection = detectSmartSelection(rects)!;
    expect(respace(rects, selection, 5)).toEqual([
      { x: 0, y: 0 },
      { x: 55, y: 10 },
      { x: 90, y: 0 },
    ]);
    expect(respace(rects, selection, -10)[1]).toEqual({ x: 50, y: 10 });
  });

  test('spacing handles sit in the middle of each gap', () => {
    const rects = [r(0, 0, 50, 50), r(70, 10, 30, 30)];
    expect(spacingHandles(rects, detectSmartSelection(rects)!)).toEqual([{ x: 60, y: 25 }]);
  });
});
