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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle, makeText } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { Editor } from '@/editor/editor';
import { describeLayer, describeSelection, pageOutline } from './canvas-outline';

let editor: Editor;
let frame: string;
let box: string;
let label: string;

beforeEach(() => {
  const ids = new IdGenerator('a');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  [frame, box, label] = editor.history.run('create', (tx) => {
    const page = editor.pageId;
    const f = editor.ids.next();
    tx.create(makeFrame({ id: f, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Card', x: 100, y: 50, width: 200, height: 120 }));
    const r = editor.ids.next();
    tx.create(makeRectangle({ id: r, parent: { id: f, key: keyOnTop(tx.store, f) }, name: 'Badge', x: 10, y: 20, width: 40, height: 30 }));
    const t = editor.ids.next();
    tx.create(makeText({ id: t, parent: { id: f, key: keyOnTop(tx.store, f) }, name: 'Title', x: 0, y: 0, width: 80, height: 20 }));
    tx.set(t, 'characters', 'Hello');
    return [f, r, t];
  });
});

describe('the canvas as a screen reader reads it', () => {
  test('a layer is described by what it is, what it says, and the room it takes', () => {
    expect(describeLayer(editor.doc, editor.scene, box)).toBe('Badge, rectangle, 40 by 30, at 110, 70');
    expect(describeLayer(editor.doc, editor.scene, label)).toBe('Title, text, “Hello”, 80 by 20, at 100, 50');
    editor.history.run('hide', (tx) => {
      tx.set(box, 'visible', false);
      tx.set(box, 'locked', true);
    });
    expect(describeLayer(editor.doc, editor.scene, box)).toContain('locked, hidden');
  });

  test('the page is read topmost layer first, the layers inside one nested under it', () => {
    const outline = pageOutline(editor.doc, editor.scene, editor.pageId);
    expect(outline.map((item) => item.id)).toEqual([frame]);
    expect(outline[0]!.children.map((item) => item.id)).toEqual([label, box]);
    expect(outline[0]).toMatchObject({ hidden: false, locked: false });
  });

  test('an auto layout frame is read in the order it lays its children out', () => {
    editor.history.run('layout', (tx) => tx.set(frame, 'layoutMode', 'VERTICAL'));
    expect(pageOutline(editor.doc, editor.scene, editor.pageId)[0]!.children.map((item) => item.id)).toEqual([box, label]);
  });

  test('what is said when the selection changes says how many, or what the one is', () => {
    expect(describeSelection(editor.doc, editor.scene, [])).toBe('Nothing selected');
    expect(describeSelection(editor.doc, editor.scene, [box])).toBe('Badge, rectangle, 40 by 30, at 110, 70, selected');
    expect(describeSelection(editor.doc, editor.scene, [box, label])).toBe('2 layers selected');
  });
});
