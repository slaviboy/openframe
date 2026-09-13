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
import { colorEquals } from './color';
import { formatColorFields, parseColorFields } from './format';

const orange = { r: 1, g: 0.5, b: 0, a: 1 };

describe('color formats', () => {
  test('formats fields for every format', () => {
    expect(formatColorFields(orange, 'hex')).toEqual(['FF8000']);
    expect(formatColorFields(orange, 'rgb')).toEqual(['255', '128', '0']);
    expect(formatColorFields(orange, 'hsl')).toEqual(['30', '100', '50']);
    expect(formatColorFields(orange, 'hsb')).toEqual(['30', '100', '100']);
  });

  test('round-trips through every format', () => {
    for (const format of ['hex', 'rgb', 'hsl', 'hsb'] as const) {
      const parsed = parseColorFields(formatColorFields(orange, format), format)!;
      expect(colorEquals(parsed, orange)).toBe(true);
    }
  });

  test('clamps numbers and rejects malformed input', () => {
    expect(parseColorFields(['300', '-5', '128'], 'rgb')).toEqual({ r: 1, g: 0, b: 128 / 255, a: 1 });
    expect(parseColorFields(['12', 'x', '3'], 'rgb')).toBeNull();
    expect(parseColorFields(['12', '3'], 'hsl')).toBeNull();
    expect(parseColorFields(['zz'], 'hex')).toBeNull();
    expect(parseColorFields(['#f00'], 'hex')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });
});
