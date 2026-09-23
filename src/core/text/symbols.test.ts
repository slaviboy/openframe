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
import { SMART_SYMBOLS } from './smart-symbols';
import { containsSymbols } from './symbols';

describe('symbol characters', () => {
  test('finds the blocks the symbol fallbacks serve', () => {
    expect(containsSymbols('The tab chips and ← stay usable')).toBe(true);
    expect(containsSymbols('a → b')).toBe(true);
    expect(containsSymbols('✓')).toBe(true);
    expect(containsSymbols('★')).toBe(true);
    // Mathematical alphanumerics, which Noto Sans Math carries.
    expect(containsSymbols(String.fromCodePoint(0x1d400))).toBe(true);
  });

  test('leaves plain text, punctuation and other scripts alone', () => {
    expect(containsSymbols('Hello world')).toBe(false);
    expect(containsSymbols('“Acme” — one…')).toBe(false);
    expect(containsSymbols('Привет')).toBe(false);
    expect(containsSymbols('你好')).toBe(false);
    expect(containsSymbols('')).toBe(false);
  });

  test('covers every smart symbol the editor can type', () => {
    // -> becomes an arrow and [ ] a ballot box, so typing them must reach a font that draws them.
    // (c), (r) and (tm) are in Inter itself, and are in these blocks too.
    for (const [, symbol] of SMART_SYMBOLS) {
      expect(containsSymbols(symbol) || symbol.codePointAt(0)! < 0x2100).toBe(true);
    }
    expect(SMART_SYMBOLS.filter(([, symbol]) => containsSymbols(symbol)).length).toBeGreaterThanOrEqual(6);
  });
});
