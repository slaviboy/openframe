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
import { VARIABLE_FONT_STYLES } from './font-style';
import { stepFontSize, stepFontWeight, stepLetterSpacing, stepLineHeight } from './typography-steps';

describe('typography steps', () => {
  test('font size, letter spacing and line height', () => {
    expect(stepFontSize(12, 1)).toBe(13);
    expect(stepFontSize(12.4, -1)).toBe(11);
    expect(stepFontSize(1, -1)).toBe(1);
    expect(stepLetterSpacing({ unit: 'PERCENT', value: 0 }, -1)).toEqual({ unit: 'PERCENT', value: -0.1 });
    expect(stepLetterSpacing({ unit: 'PIXELS', value: 1.25 }, 1)).toEqual({ unit: 'PIXELS', value: 1.35 });
    expect(stepLineHeight({ unit: 'AUTO' }, 14.52, 1)).toEqual({ unit: 'PIXELS', value: 16 });
    expect(stepLineHeight({ unit: 'PERCENT', value: 150 }, 0, -1)).toEqual({ unit: 'PERCENT', value: 149 });
    expect(stepLineHeight({ unit: 'PIXELS', value: 0 }, 0, -1)).toEqual({ unit: 'PIXELS', value: 0 });
  });

  test('font weight moves through available styles keeping the slant', () => {
    expect(stepFontWeight('Regular', VARIABLE_FONT_STYLES, 1)).toBe('Medium');
    expect(stepFontWeight('Bold Italic', VARIABLE_FONT_STYLES, -1)).toBe('Semi Bold Italic');
    expect(stepFontWeight('Black', VARIABLE_FONT_STYLES, 1)).toBeNull();
    expect(stepFontWeight('Regular', ['Regular', 'Bold', 'Italic'], 1)).toBe('Bold');
    expect(stepFontWeight('Bold', ['Regular', 'Bold', 'Italic'], -1)).toBe('Regular');
  });
});
