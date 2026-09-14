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
import { escapeXml, svgNumber, svgPathData } from './svg-path';

describe('SVG markup helpers', () => {
  test('numbers keep at most 3 decimals, without trailing zeros or a negative zero', () => {
    expect(svgNumber(1.23456)).toBe('1.235');
    expect(svgNumber(10)).toBe('10');
    expect(svgNumber(0.1 + 0.2)).toBe('0.3');
    expect(svgNumber(-0.0001)).toBe('0');
    expect(svgNumber(-2.5)).toBe('-2.5');
  });

  test('path commands become absolute path data', () => {
    expect(
      svgPathData([
        { op: 'M', x: 0, y: 0 },
        { op: 'L', x: 10.5, y: 0 },
        { op: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 },
        { op: 'Z' },
      ]),
    ).toBe('M0 0L10.5 0C1 2 3 4 5 6Z');
    expect(svgPathData([])).toBe('');
  });

  test('text is escaped for markup, and control characters XML disallows are removed', () => {
    expect(escapeXml(`a<b & "c" 'd'>`)).toBe('a&lt;b &amp; &quot;c&quot; &apos;d&apos;&gt;');
    expect(escapeXml('xy\tz\n')).toBe('xy\tz\n');
  });
});
