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
import { makeText } from '../document/factory';
import type { TextNode } from '../schema/document';
import { containsRtl, detectDirection, directionAt } from './direction';
import { styleRange } from './style-runs';

describe('text direction', () => {
  test('a paragraph takes the direction of its first letter', () => {
    expect(detectDirection('שלום world')).toBe('RTL');
    expect(detectDirection('Hello שלום')).toBe('LTR');
    expect(detectDirection('123 — مرحبا')).toBe('RTL');
    expect(detectDirection('42!')).toBe('LTR');
    expect(containsRtl('Hello שלום')).toBe(true);
    expect(containsRtl('Привет')).toBe(false);
  });

  test('each paragraph detects its direction unless it is set', () => {
    const base: TextNode = { ...makeText({ id: 'x:1', parent: { id: 'x:0', key: 'V' }, name: 'T', x: 0, y: 0, width: 0, height: 0 }), characters: 'Hello\nשלום\nمرحبا' };
    expect([0, 7, 12].map((offset) => directionAt(base, offset))).toEqual(['LTR', 'RTL', 'RTL']);
    // Set the last paragraph (and its line break) left to right.
    const node = { ...base, styleRuns: styleRange(base, 11, 16, { textDirection: 'LTR' }) };
    expect([0, 7, 12].map((offset) => directionAt(node, offset))).toEqual(['LTR', 'RTL', 'LTR']);
  });
});
