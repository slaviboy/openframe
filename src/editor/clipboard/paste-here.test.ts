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

import { beforeEach, describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { Node } from '@/core/schema/document';
import { Editor } from '../editor';
import { createClipboardPayload } from './payload';
import { pastePayload } from './paste';

let editor: Editor;

function add(make: (i: { id: string; parent: { id: string; key: string }; name: string; x: number; y: number; width: number; height: number }) => Node, x: number, y: number, w: number, h: number): string {
  return editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create(make({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'L', x, y, width: w, height: h }));
    return id;
  });
}

beforeEach(() => {
  const ids = new IdGenerator('h');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
});

describe('paste here', () => {
  test('centers the content on the point, inside the frame under it', () => {
    const frame = add(makeFrame, 0, 0, 300, 300);
    const rect = add(makeRectangle, 600, 600, 40, 20);
    editor.state.select([rect]);
    const payload = createClipboardPayload(editor)!;
    const [pasted] = pastePayload(editor, payload, 'default', { x: 100, y: 150 });
    expect(editor.doc.parentOf(pasted!)).toBe(frame);
    editor.scene.ensure(editor.pageId);
    expect(editor.scene.worldBounds(pasted!)).toEqual({ x: 80, y: 140, width: 40, height: 20 });
    expect(editor.selection).toEqual([pasted]);
  });

  test('on empty canvas the content goes on the page, even when a frame is selected', () => {
    const frame = add(makeFrame, 0, 0, 300, 300);
    const rect = add(makeRectangle, 600, 600, 40, 20);
    editor.state.select([rect]);
    const payload = createClipboardPayload(editor)!;
    editor.state.select([frame]);
    const [pasted] = pastePayload(editor, payload, 'default', { x: 1000, y: 1000 });
    expect(editor.doc.parentOf(pasted!)).toBe(editor.pageId);
    editor.scene.ensure(editor.pageId);
    expect(editor.scene.worldBounds(pasted!)).toMatchObject({ x: 980, y: 990 });
  });
});
