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

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { isValidKey, keyBetween, keysBetween } from './fractional-index';
import { IdGenerator, isId } from './ids';

describe('IdGenerator', () => {
  test('produces replica-scoped monotonic ids', () => {
    const gen = new IdGenerator('abc', 5);
    expect(gen.next()).toBe('abc:5');
    expect(gen.next()).toBe('abc:6');
    expect(isId('abc:6')).toBe(true);
    expect(isId('ABC:6')).toBe(false);
  });

  test('observe skips past existing ids of the same replica only', () => {
    const gen = new IdGenerator('r1');
    gen.observe('r1:41');
    gen.observe('zz:999');
    expect(gen.next()).toBe('r1:42');
  });
});

describe('fractional index', () => {
  test('basic ordering', () => {
    const first = keyBetween(null, null);
    const after = keyBetween(first, null);
    const before = keyBetween(null, first);
    const mid = keyBetween(before, first);
    expect(before < mid && mid < first && first < after).toBe(true);
  });

  test('repeated insertion at the front stays valid', () => {
    let k = keyBetween(null, null);
    for (let i = 0; i < 200; i++) {
      const next = keyBetween(null, k);
      expect(next < k).toBe(true);
      expect(isValidKey(next)).toBe(true);
      k = next;
    }
  });

  test('repeated insertion at the end stays valid', () => {
    let k = keyBetween(null, null);
    for (let i = 0; i < 200; i++) {
      const next = keyBetween(k, null);
      expect(next > k).toBe(true);
      k = next;
    }
    expect(k.length).toBeLessThan(60);
  });

  test('property: any random insertion sequence preserves order', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 1, maxLength: 120 }), (positions) => {
        const keys: string[] = [];
        for (const p of positions) {
          const idx = p % (keys.length + 1);
          const k = keyBetween(keys[idx - 1] ?? null, keys[idx] ?? null);
          if (!isValidKey(k)) return false;
          keys.splice(idx, 0, k);
        }
        return keys.every((k, i) => i === 0 || keys[i - 1]! < k);
      }),
    );
  });

  test('keysBetween yields ascending keys inside bounds', () => {
    const keys = keysBetween('A', 'B', 10);
    expect(keys.every((k, i) => k > 'A' && k < 'B' && (i === 0 || keys[i - 1]! < k))).toBe(true);
  });

  test('rejects inverted bounds', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
  });
});
