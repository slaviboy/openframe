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
import { formatDescription, parseDescription, parseInlines } from './description';

describe('flow descriptions', () => {
  test('bold runs and links; an unclosed ** and unsafe links stay as written', () => {
    expect(parseInlines('Tap **Buy now** then see [the guide](https://example.com/guide)')).toEqual([
      { type: 'text', text: 'Tap ', bold: false },
      { type: 'text', text: 'Buy now', bold: true },
      { type: 'text', text: ' then see ', bold: false },
      { type: 'link', text: 'the guide', href: 'https://example.com/guide', bold: false },
    ]);
    expect(parseInlines('Visit https://example.com today')).toEqual([
      { type: 'text', text: 'Visit ', bold: false },
      { type: 'link', text: 'https://example.com', href: 'https://example.com', bold: false },
      { type: 'text', text: ' today', bold: false },
    ]);
    expect(parseInlines('2 ** 3 and [x](javascript:alert(1))')).toEqual([{ type: 'text', text: '2 ** 3 and [x](javascript:alert(1))', bold: false }]);
  });

  test('paragraphs, bulleted and numbered lists', () => {
    expect(parseDescription('Goal: check out.\n\n- Open the cart\n- Pay\n1. First\n2. Second\nThanks')).toEqual([
      { type: 'paragraph', inlines: [{ type: 'text', text: 'Goal: check out.', bold: false }] },
      { type: 'list', ordered: false, items: [[{ type: 'text', text: 'Open the cart', bold: false }], [{ type: 'text', text: 'Pay', bold: false }]] },
      { type: 'list', ordered: true, items: [[{ type: 'text', text: 'First', bold: false }], [{ type: 'text', text: 'Second', bold: false }]] },
      { type: 'paragraph', inlines: [{ type: 'text', text: 'Thanks', bold: false }] },
    ]);
  });

  test('the formatting buttons mark the selection up, and list formats toggle', () => {
    expect(formatDescription('Buy now', 0, 3, 'bold')).toEqual({ text: '**Buy** now', start: 2, end: 5 });
    expect(formatDescription('Guide', 0, 5, 'link', 'https://x.io')).toEqual({ text: '[Guide](https://x.io)', start: 0, end: 21 });
    const bullets = formatDescription('Intro\nOne\nTwo', 7, 12, 'bullets');
    expect(bullets.text).toBe('Intro\n- One\n- Two');
    expect(formatDescription(bullets.text, bullets.start, bullets.end, 'bullets').text).toBe('Intro\nOne\nTwo');
    expect(formatDescription('One\nTwo', 0, 7, 'numbers').text).toBe('1. One\n2. Two');
  });
});
