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
 * Evaluates arithmetic typed into numeric inspector fields: numbers, + − * / ^ and
 * parentheses, e.g. "120/2+8". Returns null for anything else (no identifiers, no eval).
 * When `current` is provided, a leading operator applies to it ("+10" → current + 10).
 */
export function evaluateMath(input: string, current?: number): number | null {
  let src = input.trim().replace(/,/g, '.').replace(/[×x]/g, '*').replace(/÷/g, '/').replace(/%$/, '');
  if (src === '') return null;
  // A leading "+", "*", "/" or "^" is relative to the current value. A leading "-" stays a
  // negative literal, because negative positions are far more common than subtraction.
  if (current !== undefined && /^[+*/^]/.test(src)) src = `${current}${src}`;
  let pos = 0;
  const peek = () => src[pos];
  const skip = () => {
    while (src[pos] === ' ') pos++;
  };
  const expr = (): number => {
    let v = term();
    for (skip(); peek() === '+' || peek() === '-'; skip()) {
      const op = src[pos++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const term = (): number => {
    let v = power();
    for (skip(); peek() === '*' || peek() === '/'; skip()) {
      const op = src[pos++];
      const r = power();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const power = (): number => {
    const base = unary();
    skip();
    if (peek() === '^') {
      pos++;
      return base ** power();
    }
    return base;
  };
  const unary = (): number => {
    skip();
    if (peek() === '-') {
      pos++;
      return -unary();
    }
    if (peek() === '+') {
      pos++;
      return unary();
    }
    return primary();
  };
  const primary = (): number => {
    skip();
    if (peek() === '(') {
      pos++;
      const v = expr();
      skip();
      if (peek() !== ')') throw new Error('expected )');
      pos++;
      return v;
    }
    const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(src.slice(pos));
    if (!m) throw new Error('expected number');
    pos += m[0].length;
    return Number(m[0]);
  };
  try {
    const v = expr();
    skip();
    if (pos !== src.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/** Display formatting for inspector numbers: up to 2 decimals, no trailing zeros. */
export function formatNumber(value: number, decimals = 2): string {
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? '0' : String(r);
}
