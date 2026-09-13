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
import { createEmptyDocument, keyOnTop, makeRectangle, solid } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { Paint } from '@/core/schema/document';
import { Editor } from '@/editor/editor';
import { toHex6 } from './color';
import { documentColors } from './document-colors';

const red = { r: 1, g: 0, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 1 };

describe('documentColors', () => {
  test('lists distinct visible solid colors, most used first', () => {
    const ids = new IdGenerator('d');
    const editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
    const add = (fills: Paint[], strokes: Paint[] = []) =>
      editor.history.run('seed', (tx) => {
        const id = editor.ids.next();
        tx.create({ ...makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 0, y: 0, width: 10, height: 10 }), fills, strokes });
      });
    add([solid(red)]);
    add([solid(blue)], [solid(blue)]);
    add([{ ...solid(red), opacity: 0.5 }, { ...solid(blue), visible: false }]);
    add([{ type: 'GRADIENT_LINEAR', stops: [], transform: [1, 0, 0, 0, 1, 0], opacity: 1, visible: true, blendMode: 'NORMAL' } as unknown as Paint]);

    const colors = documentColors(editor.doc);
    expect(colors.map((c) => `${toHex6(c.color)}:${c.opacity}`)).toEqual(['0000FF:1', 'FF0000:1', 'FF0000:0.5']);
    expect(documentColors(editor.doc, 1)).toHaveLength(1);
  });
});
