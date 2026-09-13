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
import { fuzzyFilter, fuzzyScore } from './fuzzy';

describe('fuzzyScore', () => {
  test('requires every query character in order, case-insensitively', () => {
    expect(fuzzyScore('grp', 'Group selection')).not.toBeNull();
    expect(fuzzyScore('GRP', 'group')).not.toBeNull();
    expect(fuzzyScore('pgr', 'Group')).toBeNull();
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  test('word starts and consecutive characters rank higher', () => {
    const zoomFit = fuzzyScore('zf', 'Zoom to fit')!;
    const buried = fuzzyScore('zf', 'Hazardous buffer')!;
    expect(zoomFit).toBeGreaterThan(buried);
    expect(fuzzyScore('dup', 'Duplicate')!).toBeGreaterThan(fuzzyScore('dup', 'Edit update')!);
  });
});

describe('fuzzyFilter', () => {
  const commands = ['Zoom in', 'Zoom out', 'Zoom to fit', 'Group selection', 'Ungroup', 'Delete page'];

  test('filters and ranks', () => {
    const result = fuzzyFilter(commands, 'group', (c) => c);
    expect(result).toEqual(['Group selection', 'Ungroup']);
    expect(fuzzyFilter(commands, 'zfit', (c) => c)[0]).toBe('Zoom to fit');
  });

  test('empty query keeps every item in order', () => {
    expect(fuzzyFilter(commands, '  ', (c) => c)).toEqual(commands);
  });
});
