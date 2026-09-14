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
import { createEmptyDocument, keyOnTop, makeRectangle, makeText } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { Paint } from '@/core/schema/document';
import { createStyle } from '@/editor/commands/styles';
import { Editor } from '@/editor/editor';
import { usedImageHashes } from './image-references';

const image = (char: string): Paint => ({ type: 'IMAGE', imageHash: char.repeat(64), scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' });

describe('usedImageHashes', () => {
  test("collects image paints from layers' fills and strokes, text ranges and color styles, once each and sorted", () => {
    const ids = new IdGenerator('e');
    const editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
    expect(usedImageHashes(editor.doc)).toEqual([]);
    editor.history.run('create', (tx) => {
      const page = editor.pageId;
      const rect = editor.ids.next();
      tx.create(makeRectangle({ id: rect, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Photo', x: 0, y: 0, width: 10, height: 10 }));
      tx.set(rect, 'fills', [image('c'), image('a')]);
      tx.set(rect, 'strokes', [image('a')]);
      const text = editor.ids.next();
      tx.create(makeText({ id: text, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Title', x: 0, y: 20, width: 100, height: 20 }));
      tx.set(text, 'characters', 'Hi');
      tx.set(text, 'styleRuns', [{ start: 0, end: 1, style: { fills: [image('d')] } }]);
    });
    createStyle(editor, 'FILL', 'Texture', { paints: [image('b')] });
    expect(usedImageHashes(editor.doc)).toEqual(['a', 'b', 'c', 'd'].map((c) => c.repeat(64)));
  });
});
