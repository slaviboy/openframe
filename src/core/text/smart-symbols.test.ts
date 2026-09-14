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
import { smartSymbol } from './smart-symbols';

describe('smart quotes and symbols', () => {
  test('sequences become symbols when their last character is typed', () => {
    expect(smartSymbol('a -', '>')).toEqual({ remove: 1, text: '→' });
    expect(smartSymbol('<', '-')).toEqual({ remove: 1, text: '←' });
    expect(smartSymbol('v', 'v')).toEqual({ remove: 1, text: '↓' });
    expect(smartSymbol('^', '^')).toEqual({ remove: 1, text: '↑' });
    expect(smartSymbol('Acme (C', ')')).toEqual({ remove: 2, text: '©' });
    expect(smartSymbol('(r', ')')).toEqual({ remove: 2, text: '®' });
    expect(smartSymbol('Brand(tm', ')')).toEqual({ remove: 3, text: '™' });
    expect(smartSymbol('[ ', ']')).toEqual({ remove: 2, text: '▢' });
    expect(smartSymbol('a', '-')).toBeNull();
    expect(smartSymbol('(x', ')')).toBeNull();
  });

  test('straight quotes open after a space or bracket and close otherwise', () => {
    expect(smartSymbol('', '"')).toEqual({ remove: 0, text: '“' });
    expect(smartSymbol('say ', '"')).toEqual({ remove: 0, text: '“' });
    expect(smartSymbol('“hi', '"')).toEqual({ remove: 0, text: '”' });
    expect(smartSymbol('(', "'")).toEqual({ remove: 0, text: '‘' });
    expect(smartSymbol("don", "'")).toEqual({ remove: 0, text: '’' });
  });
});
