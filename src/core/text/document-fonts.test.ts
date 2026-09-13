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
import { createEmptyDocument, makeText } from '../document/factory';
import { IdGenerator } from '../ids/ids';
import { usedFontFamilies } from './document-fonts';

describe('fonts in a file', () => {
  test('lists the families of text layers and their style runs', () => {
    const ids = new IdGenerator('f');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    const text = (key: string, family: string, runFamily?: string) =>
      store.applyOp({
        kind: 'create',
        node: {
          ...makeText({ id: ids.next(), parent: { id: page, key }, name: 'T', x: 0, y: 0, width: 0, height: 0 }),
          characters: 'abc',
          fontName: { family, style: 'Regular' },
          ...(runFamily ? { styleRuns: [{ start: 0, end: 1, style: { fontName: { family: runFamily, style: 'Bold' } } }] } : {}),
        },
      });
    text('V', 'Zeta', 'Alpha');
    text('W', 'Inter');
    expect(usedFontFamilies(store)).toEqual(['Alpha', 'Inter', 'Zeta']);
  });
});
