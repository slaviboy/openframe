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
import { applyTextCase } from './letter-case';

describe('letter case', () => {
  test('upper, lower and title case transform the displayed text', () => {
    expect(applyTextCase('Hello world', 'UPPER')).toBe('HELLO WORLD');
    expect(applyTextCase('Hello World', 'LOWER')).toBe('hello world');
    expect(applyTextCase('hello big-world, again', 'TITLE')).toBe('Hello Big-World, Again');
    expect(applyTextCase('Hello', 'ORIGINAL')).toBe('Hello');
    expect(applyTextCase('Hello', 'SMALL_CAPS')).toBe('Hello');
    expect(applyTextCase('Hello', undefined)).toBe('Hello');
  });

  test('the displayed text keeps its length so offsets stay aligned', () => {
    const text = 'straße ﬁ café';
    const upper = applyTextCase(text, 'UPPER');
    expect(upper).toHaveLength(text.length);
    expect(upper.startsWith('STRAßE')).toBe(true);
    expect(applyTextCase('👋🏽 hi', 'UPPER')).toBe('👋🏽 HI');
  });
});
