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
import { evaluateExpression, ExpressionError, parseExpression, type ExprValue } from './expressions';

const vars: Record<string, ExprValue> = { count: 3, name: 'Ada', agreed: false, 'Cart/total': 20, 'price:EUR': 9 };
const run = (src: string) =>
  evaluateExpression(parseExpression(src), (n, m) => vars[m ? `${n}:${m}` : n]);

describe('expressions', () => {
  test('arithmetic precedence', () => {
    expect(run('1 + 2 * 3')).toBe(7);
    expect(run('(1 + 2) * 3')).toBe(9);
    expect(run('10 - 4 - 3')).toBe(3);
  });

  test('variables and modes', () => {
    expect(run('{count} + 1')).toBe(4);
    expect(run('{Cart/total} / 4')).toBe(5);
    expect(run('{price:EUR} * 2')).toBe(18);
  });

  test('string concatenation', () => {
    expect(run('"Hi " + {name}')).toBe('Hi Ada');
    expect(run('"Items: " + {count}')).toBe('Items: 3');
  });

  test('boolean logic with precedence and > or', () => {
    expect(run('{count} > 2 and {agreed} == false')).toBe(true);
    expect(run('true or false and false')).toBe(true);
    expect(run('not {agreed}')).toBe(true);
    expect(run('!true')).toBe(false);
  });

  test('negative literals', () => {
    expect(run('-5 + 2')).toBe(-3);
    expect(run('{count} > -1')).toBe(true);
  });

  test('errors report positions', () => {
    expect(() => parseExpression('1 +')).toThrow(ExpressionError);
    expect(() => parseExpression('hello')).toThrow(/quotes/);
    expect(() => parseExpression('(1 + 2')).toThrow(/Expected/);
  });
});
