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
import { Editor } from '@/editor/editor';
import { IdGenerator } from '../ids/ids';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from './factory';
import { canBeThumbnail, setThumbnailFrame, thumbnailFrameId, thumbnailSource } from './file-thumbnail';

describe('file thumbnails', () => {
  test('show the frame set as the thumbnail while it exists, else the first page; setting it is undoable', () => {
    const ids = new IdGenerator('e');
    const editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
    const store = editor.doc;
    const page = editor.pageId;
    expect(thumbnailSource(store)).toEqual({ kind: 'page', pageId: page });

    const [frame, rect] = editor.history.run('create', (tx) => {
      const f = editor.ids.next();
      tx.create(makeFrame({ id: f, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Cover', x: 0, y: 0, width: 1920, height: 1080 }));
      const r = editor.ids.next();
      tx.create(makeRectangle({ id: r, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Box', x: 0, y: 0, width: 10, height: 10 }));
      return [f, r];
    });
    expect(canBeThumbnail(store, frame)).toBe(true);
    expect(canBeThumbnail(store, rect)).toBe(false);

    editor.history.run('Set as thumbnail', (tx) => setThumbnailFrame(tx, frame));
    expect(thumbnailFrameId(store)).toBe(frame);
    expect(thumbnailSource(store)).toEqual({ kind: 'frame', id: frame, pageId: page });

    // A deleted frame falls back to the first page.
    editor.history.run('delete', (tx) => tx.delete(frame));
    expect(thumbnailSource(store)).toEqual({ kind: 'page', pageId: page });
    editor.history.undo();
    expect(thumbnailSource(store)).toEqual({ kind: 'frame', id: frame, pageId: page });

    editor.history.run('Restore default thumbnail', (tx) => setThumbnailFrame(tx, null));
    expect(thumbnailFrameId(store)).toBeUndefined();
    editor.history.undo();
    expect(thumbnailFrameId(store)).toBe(frame);
  });
});
