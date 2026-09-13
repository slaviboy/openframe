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
import type { Node, SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { createClipboardPayload, decodeClipboardHtml, encodeClipboardHtml } from './payload';
import { pastePayload } from './paste';

let editor: Editor;

function add(make: (i: { id: string; parent: { id: string; key: string }; name: string; x: number; y: number; width: number; height: number }) => Node, x: number, y: number, w: number, h: number, parent = editor.pageId): string {
  return editor.history.run('seed', (tx) => {
    const id = editor.ids.next();
    tx.create(make({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name: 'L', x, y, width: w, height: h }));
    return id;
  });
}
const local = (id: string) => (editor.doc.getOrThrow(id) as SceneNode).transform.slice(4);

beforeEach(() => {
  const ids = new IdGenerator('p');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
});

describe('paste into several frames', () => {
  test('one copy per selected frame at the same frame-relative position, in one undo step', () => {
    const f1 = add(makeFrame, 0, 0, 200, 200);
    const f2 = add(makeFrame, 300, 50, 200, 200);
    const f3 = add(makeFrame, 0, 400, 150, 150);
    const rect = add(makeRectangle, 20, 30, 40, 40, f1);
    editor.state.select([rect]);
    // The frame-relative origin survives the system clipboard encoding.
    const payload = decodeClipboardHtml(encodeClipboardHtml(createClipboardPayload(editor)!))!;
    expect(payload.sourceOrigin).toEqual({ x: 0, y: 0 });

    editor.state.select([f2, f3]);
    const pasted = pastePayload(editor, payload);
    expect(pasted.map((id) => editor.doc.parentOf(id))).toEqual([f2, f3]);
    expect(pasted.map(local)).toEqual([
      [20, 30],
      [20, 30],
    ]);
    expect(editor.selection).toEqual(pasted);
    editor.history.undo();
    expect(pasted.some((id) => editor.doc.has(id))).toBe(false);
    expect(editor.doc.has(f2)).toBe(true);
  });

  test('content copied from the page is centered in each frame', () => {
    const f1 = add(makeFrame, 0, 0, 200, 200);
    const f2 = add(makeFrame, 300, 0, 100, 100);
    const rect = add(makeRectangle, 1000, 1000, 40, 20);
    editor.state.select([rect]);
    const payload = createClipboardPayload(editor)!;
    expect(payload.sourceOrigin).toBeUndefined();
    editor.state.select([f1, f2]);
    const pasted = pastePayload(editor, payload);
    expect(pasted.map(local)).toEqual([
      [80, 90],
      [30, 40],
    ]);
  });

  test('a single selected frame keeps the existing paste-into-frame behavior', () => {
    const f1 = add(makeFrame, 0, 0, 200, 200);
    const rect = add(makeRectangle, 20, 30, 40, 40, f1);
    editor.state.select([rect]);
    const payload = createClipboardPayload(editor)!;
    editor.state.select([f1]);
    const [pasted] = pastePayload(editor, payload);
    expect(editor.doc.parentOf(pasted!)).toBe(f1);
  });
});
