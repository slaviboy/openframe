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
import { contrastRatio, hsbToRgb, hslToRgb, parseHex, rgbToHsb, rgbToHsl, toHex6, toHex8 } from './color';

describe('hex', () => {
  test('parses long and short forms', () => {
    expect(toHex6(parseHex('#0d99ff')!)).toBe('0D99FF');
    expect(toHex6(parseHex('fff')!)).toBe('FFFFFF');
    expect(toHex6(parseHex('E')!)).toBe('EEEEEE');
    expect(toHex8(parseHex('11223380')!)).toBe('11223380');
  });

  test('rejects invalid input', () => {
    expect(parseHex('zzz')).toBeNull();
    expect(parseHex('12345')).toBeNull();
  });
});

describe('color models round-trip', () => {
  const samples = ['0D99FF', 'F24822', '14AE5C', '000000', 'FFFFFF', '9747FF', '7F7F7F'];
  test.each(samples)('%s via HSB and HSL', (hex) => {
    const c = parseHex(hex)!;
    expect(toHex6(hsbToRgb(rgbToHsb(c)))).toBe(hex);
    expect(toHex6(hslToRgb(rgbToHsl(c)))).toBe(hex);
  });
});

test('contrast ratio of black on white is 21', () => {
  expect(contrastRatio(parseHex('000')!, parseHex('fff')!)).toBeCloseTo(21, 5);
});
