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
import { cjkScriptFor, cjkSubsetFamily, cjkSubsetsFor, containsCjk, isCjkSubsetFamily } from './cjk';

describe('CJK text', () => {
  test('detection and the script whose Noto font draws it', () => {
    expect(containsCjk('Hello 世界')).toBe(true);
    expect(containsCjk('こんにちは')).toBe(true);
    expect(containsCjk('안녕하세요')).toBe(true);
    expect(containsCjk('Hello, world')).toBe(false);
    expect(cjkScriptFor('日本語のテキスト', 'Inter')).toBe('JP');
    expect(cjkScriptFor('한국어 文字', 'Inter')).toBe('KR');
    expect(cjkScriptFor('中文字体', 'Inter')).toBe('SC');
    // A picked Noto family decides shared Han characters.
    expect(cjkScriptFor('中文字体', 'Noto Sans TC')).toBe('TC');
    expect(cjkSubsetFamily('JP', 12)).toBe('Noto Sans JP (12)');
    expect(isCjkSubsetFamily('Noto Sans JP (12)')).toBe(true);
    expect(isCjkSubsetFamily('Noto Sans JP')).toBe(false);
  });

  test('only the subsets covering the text are needed', () => {
    const table = [
      [0, '3000-303f,3041-3096'],
      [1, '4e00-4e10,65e5'],
      [2, 'ac00-d7a3'],
      [3, '20-7e'],
    ] as const;
    expect(cjkSubsetsFor('あ日', table)).toEqual([0, 1]);
    expect(cjkSubsetsFor('한', table)).toEqual([2]);
    // ASCII never selects subsets; it is drawn by the layer's own fonts.
    expect(cjkSubsetsFor('abc', table)).toEqual([]);
    expect(cjkSubsetsFor('鬱', table)).toEqual([]);
  });
});
