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

/**
 * Fractional indexing for sibling order. Each child stores a string `key`; siblings
 * sort lexicographically by key (ties broken by id). Inserting between two siblings
 * produces a new key without renumbering the others, so a reorder is a single field
 * write — cheap to undo, journal, and 3-way merge.
 *
 * Keys are base-62 digit strings interpreted as fractions in (0, 1): "V" ≈ 0.5.
 * The last digit of a generated key is never "0", which keeps a strictly
 * smaller key always constructible.
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

const digit = (ch: string): number => {
  const v = DIGITS.indexOf(ch);
  if (v < 0) throw new Error(`Invalid fractional index digit "${ch}"`);
  return v;
};

export const isValidKey = (key: string): boolean => /^[0-9A-Za-z]+$/.test(key) && !key.endsWith('0');

/**
 * Returns a key strictly between `a` and `b`. `null` means unbounded
 * (start / end of the list). Throws if a >= b.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && !isValidKey(a)) throw new Error(`Invalid key "${a}"`);
  if (b !== null && !isValidKey(b)) throw new Error(`Invalid key "${b}"`);
  if (a !== null && b !== null && a >= b) throw new Error(`keyBetween: "${a}" must be < "${b}"`);
  return midpoint(a ?? '', b);
}

/** Midpoint of two digit strings where `lo` may be '' (0) and `hi` null (1). */
function midpoint(lo: string, hi: string | null): string {
  let prefix = '';
  let i = 0;
  // Copy the common prefix.
  if (hi !== null) {
    while (i < hi.length && (lo[i] ?? '0') === hi[i]) {
      prefix += hi[i];
      i++;
    }
  }
  const loDigit = i < lo.length ? digit(lo[i]!) : 0;
  const hiDigit = hi !== null && i < hi.length ? digit(hi[i]!) : BASE;

  if (hiDigit - loDigit > 1) {
    return prefix + DIGITS[Math.floor((loDigit + hiDigit) / 2)]!;
  }
  // Adjacent digits: keep lo's digit and recurse into the remainder of lo, unbounded above.
  if (hi !== null && i < hi.length && hiDigit - loDigit === 1 && i + 1 >= hi.length && i >= lo.length) {
    // lo exhausted and hi ends right after: e.g. lo='', hi='1' → go deeper under '0'.
    return prefix + DIGITS[loDigit]! + midpoint('', null);
  }
  return prefix + DIGITS[loDigit]! + midpoint(lo.slice(i + 1), null);
}

/** `count` evenly spread keys between a and b (used for bulk inserts). */
export function keysBetween(a: string | null, b: string | null, count: number): string[] {
  const out: string[] = [];
  let lo = a;
  for (let i = 0; i < count; i++) {
    const k = keyBetween(lo, b);
    out.push(k);
    lo = k;
  }
  return out;
}

export const compareKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
