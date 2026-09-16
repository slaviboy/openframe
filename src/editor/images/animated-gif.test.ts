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

import { beforeEach, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { ImagePaint } from '@/core/schema/document';
import { Editor } from '../editor';
import { animatedGifHash } from './animated-gif';

let editor: Editor;
let rect: string;

const paint = (hash: string, visible = true): ImagePaint => ({ type: 'IMAGE', imageHash: hash, scaleMode: 'FILL', opacity: 1, visible, blendMode: 'NORMAL' });

const store = (hash: string, mime: string) => void editor.images.add({ hash, bytes: new Uint8Array([1]), mime, width: 2, height: 2 });

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Shape', x: 0, y: 0, width: 60, height: 40 }));
    return id;
  });
});

test('a layer whose image fill is an animated GIF gives its hash', () => {
  store('gif-hash', 'image/gif');
  editor.history.run('fill', (tx) => tx.set(rect, 'fills', [paint('gif-hash')]));
  expect(animatedGifHash(editor, rect)).toBe('gif-hash');
});

test('other images, hidden GIF fills, layers without fills and no layer give nothing', () => {
  store('png-hash', 'image/png');
  store('gif-hash', 'image/gif');
  editor.history.run('fill', (tx) => tx.set(rect, 'fills', [paint('png-hash')]));
  expect(animatedGifHash(editor, rect)).toBeUndefined();

  editor.history.run('fill', (tx) => tx.set(rect, 'fills', [paint('gif-hash', false)]));
  expect(animatedGifHash(editor, rect)).toBeUndefined();

  expect(animatedGifHash(editor, undefined)).toBeUndefined();
  expect(animatedGifHash(editor, editor.pageId)).toBeUndefined();
});

test('a GIF that has not loaded yet gives nothing', () => {
  editor.history.run('fill', (tx) => tx.set(rect, 'fills', [paint('absent-hash')]));
  expect(animatedGifHash(editor, rect)).toBeUndefined();
});
