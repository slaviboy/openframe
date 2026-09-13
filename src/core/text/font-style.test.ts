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
import { fontStyleName, parseFontStyle, VARIABLE_FONT_STYLES } from './font-style';

describe('font styles', () => {
  test('style names map to weight and slant', () => {
    expect(parseFontStyle('Regular')).toEqual({ weight: 400, italic: false });
    expect(parseFontStyle('Italic')).toEqual({ weight: 400, italic: true });
    expect(parseFontStyle('Semi Bold Italic')).toEqual({ weight: 600, italic: true });
    expect(parseFontStyle('SemiBold')).toEqual({ weight: 600, italic: false });
    expect(parseFontStyle('ExtraLight')).toEqual({ weight: 200, italic: false });
    expect(parseFontStyle('Heavy Oblique')).toEqual({ weight: 900, italic: true });
    expect(parseFontStyle('Whatever')).toEqual({ weight: 400, italic: false });
  });

  test('weights name styles, and a variable font lists every style', () => {
    expect(fontStyleName(700, false)).toBe('Bold');
    expect(fontStyleName(400, true)).toBe('Italic');
    expect(fontStyleName(640, true)).toBe('Semi Bold Italic');
    expect(VARIABLE_FONT_STYLES).toHaveLength(18);
    expect(VARIABLE_FONT_STYLES.slice(6, 8)).toEqual(['Regular', 'Italic']);
    for (const style of VARIABLE_FONT_STYLES) expect(fontStyleName(parseFontStyle(style).weight, parseFontStyle(style).italic)).toBe(style);
  });
});
