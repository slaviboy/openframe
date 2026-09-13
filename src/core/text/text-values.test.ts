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
import { formatLetterSpacing, formatLineHeight, parseLetterSpacing, parseLineHeight } from './text-values';

describe('text values', () => {
  test('line height parses auto, pixels and percent', () => {
    expect(parseLineHeight('Auto')).toEqual({ unit: 'AUTO' });
    expect(parseLineHeight(' 24 ')).toEqual({ unit: 'PIXELS', value: 24 });
    expect(parseLineHeight('24px')).toEqual({ unit: 'PIXELS', value: 24 });
    expect(parseLineHeight('150%')).toEqual({ unit: 'PERCENT', value: 150 });
    for (const bad of ['', 'tall', '-4', '12em']) expect(parseLineHeight(bad), bad).toBeNull();
    expect(formatLineHeight({ unit: 'AUTO' })).toBe('Auto');
    expect(formatLineHeight({ unit: 'PIXELS', value: 24.456 })).toBe('24.46');
    expect(formatLineHeight({ unit: 'PERCENT', value: 150 })).toBe('150%');
  });

  test('letter spacing keeps the current unit for bare numbers and allows negatives', () => {
    expect(parseLetterSpacing('2%', 'PIXELS')).toEqual({ unit: 'PERCENT', value: 2 });
    expect(parseLetterSpacing('-1.5px', 'PERCENT')).toEqual({ unit: 'PIXELS', value: -1.5 });
    expect(parseLetterSpacing('3', 'PERCENT')).toEqual({ unit: 'PERCENT', value: 3 });
    expect(parseLetterSpacing('3', 'PIXELS')).toEqual({ unit: 'PIXELS', value: 3 });
    expect(parseLetterSpacing('wide', 'PERCENT')).toBeNull();
    expect(formatLetterSpacing({ unit: 'PERCENT', value: 0 })).toBe('0%');
    expect(formatLetterSpacing({ unit: 'PIXELS', value: -1.5 })).toBe('-1.5px');
  });
});
