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
import { placeFloating } from './position';

const viewport = { width: 1000, height: 800 };
const menu = { width: 200, height: 300 };

describe('placeFloating', () => {
  test('bottom-start below the anchor when it fits', () => {
    expect(placeFloating({ x: 100, y: 100, width: 80, height: 24 }, menu, viewport, 'bottom-start')).toEqual({ x: 100, y: 128 });
  });

  test('flips above when there is no room below', () => {
    const anchor = { x: 100, y: 700, width: 80, height: 24 };
    expect(placeFloating(anchor, menu, viewport, 'bottom-start')).toEqual({ x: 100, y: 396 });
  });

  test('top-start flips below near the top edge', () => {
    const anchor = { x: 100, y: 20, width: 80, height: 24 };
    expect(placeFloating(anchor, menu, viewport, 'top-start').y).toBe(48);
  });

  test('submenus open to the left when the right side overflows', () => {
    const anchor = { x: 850, y: 100, width: 140, height: 24 };
    expect(placeFloating(anchor, menu, viewport, 'right-start')).toEqual({ x: 646, y: 100 });
  });

  test('context menus at the pointer flip on both axes near the corner', () => {
    expect(placeFloating({ x: 950, y: 780, width: 0, height: 0 }, menu, viewport, 'point')).toEqual({ x: 750, y: 480 });
  });

  test('always clamps into the viewport margin, even for oversized content', () => {
    expect(placeFloating({ x: -50, y: 10, width: 0, height: 0 }, menu, viewport, 'point').x).toBe(8);
    expect(placeFloating({ x: 10, y: 10, width: 0, height: 0 }, { width: 2000, height: 50 }, viewport, 'point').x).toBe(8);
  });
});
