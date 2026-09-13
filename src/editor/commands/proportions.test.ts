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
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { deserializeDocument, serializeDocument } from '@/core/serialize/serialize';
import type { RectangleNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { ToolManager } from '../tools/tool-manager';
import type { PointerInfo } from '../tools/types';
import { setConstrainProportions, setSize } from './properties';

let editor: Editor;
let id: string;

const sample = (x: number, y: number, over: Partial<PointerInfo> = {}): Omit<PointerInfo, 'world'> => ({
  screen: { x, y },
  button: 0,
  shift: false,
  alt: false,
  mod: false,
  ctrl: false,
  pointerType: 'mouse',
  pressure: 0.5,
  clickCount: 1,
  ...over,
});
const node = () => editor.doc.getOrThrow(id) as RectangleNode;

beforeEach(() => {
  const ids = new IdGenerator('c');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
  id = editor.history.run('seed', (tx) => {
    const nid = editor.ids.next();
    tx.create(makeRectangle({ id: nid, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'R', x: 100, y: 100, width: 200, height: 100 }));
    return nid;
  });
});

describe('constrain proportions', () => {
  test('width and height edits keep the ratio only while constrained; the flag is stored only when on', () => {
    editor.history.run('size', (tx) => setSize(tx, node(), 'width', 100));
    expect(node().size).toEqual({ width: 100, height: 100 });
    editor.history.run('lock', (tx) => setConstrainProportions(tx, node(), true));
    expect(node().constrainProportions).toBe(true);
    editor.history.run('size', (tx) => setSize(tx, node(), 'height', 150));
    expect(node().size).toEqual({ width: 150, height: 150 });
    editor.history.run('unlock', (tx) => setConstrainProportions(tx, node(), false));
    expect('constrainProportions' in node()).toBe(false);
  });

  test('the flag round-trips through serialization', () => {
    editor.history.run('lock', (tx) => setConstrainProportions(tx, node(), true));
    const reloaded = deserializeDocument(serializeDocument(editor.doc));
    expect((reloaded.getOrThrow(id) as RectangleNode).constrainProportions).toBe(true);
  });

  test('handle resizes keep the aspect ratio for constrained layers; Shift frees them', () => {
    const tools = new ToolManager(editor);
    editor.history.run('lock', (tx) => setConstrainProportions(tx, node(), true));
    editor.state.select([id]);
    // Drag the bottom-right corner (300, 200) right by 100 px. A resize commits at the last move.
    tools.pointerDown(sample(300, 200));
    tools.pointerMove(sample(350, 200));
    tools.pointerMove(sample(400, 200));
    tools.pointerUp(sample(400, 200));
    expect(node().size).toEqual({ width: 300, height: 150 });

    tools.pointerDown(sample(400, 250));
    tools.pointerMove(sample(450, 250, { shift: true }));
    tools.pointerMove(sample(500, 250, { shift: true }));
    tools.pointerUp(sample(500, 250, { shift: true }));
    expect(node().size).toEqual({ width: 400, height: 150 });
  });
});
