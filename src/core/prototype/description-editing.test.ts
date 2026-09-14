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
import { descriptionHtml, inlineText, parseInlines } from './description';

describe('editing flow descriptions as formatted text', () => {
  test('formatted text is written back as the description holds it', () => {
    for (const text of ['Tap **Buy now** then see [the guide](https://example.com/guide)', 'Visit https://example.com today', '**[Bold link](https://x.io)** end']) {
      expect(parseInlines(inlineText(parseInlines(text)))).toEqual(parseInlines(text));
    }
    expect(inlineText(parseInlines('Visit https://example.com today'))).toBe('Visit https://example.com today');
    // Neighbouring bold runs are one run.
    expect(
      inlineText([
        { type: 'text', text: 'Buy', bold: true },
        { type: 'text', text: ' now', bold: true },
        { type: 'text', text: '!', bold: false },
      ]),
    ).toBe('**Buy now**!');
  });

  test('the editor shows paragraphs line by line, lists, bold text and links, with the text escaped', () => {
    expect(descriptionHtml('Tap **Buy <now>**\n- Open\n- Pay\n\nThanks\nBye')).toBe('<div>Tap <strong>Buy &lt;now&gt;</strong></div><ul><li>Open</li><li>Pay</li></ul><div>Thanks</div><div>Bye</div>');
    expect(descriptionHtml('One\n\nTwo')).toBe('<div>One</div><div><br></div><div>Two</div>');
    expect(descriptionHtml('1. [Guide](https://example.com/?a=1&b="2")')).toBe('<ol><li><a href="https://example.com/?a=1&amp;b=&quot;2&quot;">Guide</a></li></ol>');
  });
});
