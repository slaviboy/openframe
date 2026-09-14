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
import { exportFileName, exportScale, formatExportConstraint, MAX_EXPORT_SIDE, parseExportConstraint, uniqueFileNames } from './export-settings';

describe('export settings', () => {
  test('scales are multipliers (x or a bare number), fixed widths (w) or fixed heights (h)', () => {
    expect(parseExportConstraint('2x')).toEqual({ type: 'SCALE', value: 2 });
    expect(parseExportConstraint(' 0.5 ')).toEqual({ type: 'SCALE', value: 0.5 });
    expect(parseExportConstraint('.75X')).toEqual({ type: 'SCALE', value: 0.75 });
    expect(parseExportConstraint('512w')).toEqual({ type: 'WIDTH', value: 512 });
    expect(parseExportConstraint('100h')).toEqual({ type: 'HEIGHT', value: 100 });
    expect(parseExportConstraint('0x')).toBeNull();
    expect(parseExportConstraint('-2x')).toBeNull();
    expect(parseExportConstraint('2px')).toBeNull();
    expect(formatExportConstraint({ type: 'SCALE', value: 1.5 })).toBe('1.5x');
    expect(formatExportConstraint({ type: 'WIDTH', value: 512 })).toBe('512w');
  });

  test('the pixel scale follows the constraint and is capped at the largest bitmap', () => {
    expect(exportScale({ type: 'SCALE', value: 2 }, 100, 50)).toBe(2);
    expect(exportScale({ type: 'WIDTH', value: 512 }, 256, 100)).toBe(2);
    expect(exportScale({ type: 'HEIGHT', value: 25 }, 256, 100)).toBe(0.25);
    expect(exportScale({ type: 'SCALE', value: 4 }, 10_000, 10)).toBe(MAX_EXPORT_SIDE / 10_000);
  });

  test('file names nest slash-separated layer names in folders, with the suffix and extension', () => {
    expect(exportFileName('button/pill/default', { format: 'PNG', suffix: '@2x', constraint: { type: 'SCALE', value: 2 } })).toBe('button/pill/default@2x.png');
    expect(exportFileName('HomePage', { format: 'JPG', suffix: 'draft', constraint: { type: 'SCALE', value: 1 } })).toBe('HomePagedraft.jpg');
    expect(exportFileName(' / a:b / ', { format: 'WEBP', suffix: '', constraint: { type: 'SCALE', value: 1 } })).toBe('a_b.webp');
    expect(exportFileName('../', { format: 'PNG', suffix: '', constraint: { type: 'SCALE', value: 1 } })).toBe('Untitled.png');
    expect(uniqueFileNames(['icon.png', 'icon.png', 'a/icon.png', 'icon.png'])).toEqual(['icon.png', 'icon 2.png', 'a/icon.png', 'icon 3.png']);
  });
});
