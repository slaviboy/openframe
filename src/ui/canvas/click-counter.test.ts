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
import { ClickCounter, MULTI_CLICK_MS } from './click-counter';

describe('ClickCounter', () => {
  test('counts quick presses at the same spot and resets on time, distance or button', () => {
    const c = new ClickCounter();
    expect(c.press(10, 10, 0, 0)).toBe(1);
    expect(c.press(11, 10, 200, 0)).toBe(2);
    expect(c.current).toBe(2);
    expect(c.press(11, 11, 350, 0)).toBe(3);
    expect(c.press(11, 11, 350 + MULTI_CLICK_MS + 1, 0)).toBe(1);
    expect(c.press(40, 11, 1000, 0)).toBe(1);
    expect(c.press(40, 11, 1100, 1)).toBe(1);
  });
});
