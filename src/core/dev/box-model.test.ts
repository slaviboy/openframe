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
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '@/editor/editor';
import { boxModelOf } from './box-model';

let editor: Editor;
let frame: string;
let box: string;

const reading = (id: string) => boxModelOf(editor.doc, editor.scene, editor.doc.getOrThrow(id) as SceneNode);

beforeEach(() => {
  const ids = new IdGenerator('b');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  [frame, box] = editor.history.run('seed', (tx) => {
    const page = editor.pageId;
    const f = editor.ids.next();
    tx.create(makeFrame({ id: f, parent: { id: page, key: keyOnTop(tx.store, page) }, name: 'Card', x: 100, y: 50, width: 200, height: 120 }));
    const r = editor.ids.next();
    tx.create(makeRectangle({ id: r, parent: { id: f, key: keyOnTop(tx.store, f) }, name: 'Box', x: 20, y: 10, width: 60, height: 40 }));
    return [f, r];
  });
  editor.scene.ensure(editor.pageId);
});

describe('what the box model reads off a layer', () => {
  test('a layer reads its own size and, inside a frame, its distance to every edge', () => {
    const it = reading(box);
    expect([it.width, it.height]).toEqual([60, 40]);
    // The rectangle sits at 20,10 inside a 200 x 120 frame.
    expect(it.distance).toEqual({ top: 10, left: 20, right: 120, bottom: 70 });
  });

  test('corner radii come per corner when the layer carries them, else from the one radius', () => {
    expect(reading(box).radii).toEqual({ topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 });
    editor.history.run('radius', (tx) => tx.set(box, 'cornerRadius', 8));
    expect(reading(box).radii).toEqual({ topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 });
    editor.history.run('corners', (tx) => tx.set(box, 'cornerRadii', { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 }));
    expect(reading(box).radii).toEqual({ topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 });
  });

  test('a border is only read where the layer actually draws one', () => {
    expect(reading(box).border).toEqual({ top: null, right: null, bottom: null, left: null });
    editor.history.run('stroke', (tx) => {
      tx.set(box, 'strokes', [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }]);
      tx.set(box, 'strokeWeight', 2);
    });
    expect(reading(box).border).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
    editor.history.run('sides', (tx) => tx.set(box, 'individualStrokeWeights', { top: 4, right: 0, bottom: 0, left: 1 }));
    expect(reading(box).border).toEqual({ top: 4, right: 0, bottom: 0, left: 1 });
  });

  test('padding is read only from a frame that lays its children out', () => {
    expect(reading(frame).padding).toEqual({ top: null, right: null, bottom: null, left: null });
    editor.history.run('layout', (tx) => {
      tx.set(frame, 'layoutMode', 'VERTICAL');
      tx.set(frame, 'paddingTop', 12);
      tx.set(frame, 'paddingLeft', 8);
    });
    expect(reading(frame).padding).toEqual({ top: 12, right: 0, bottom: 0, left: 8 });
  });

  test('a text layer has no corners to round', () => {
    const text = editor.history.run('text', (tx) => {
      const id = editor.ids.next();
      tx.create(makeText({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'T', x: 0, y: 0, width: 40, height: 20 }));
      return id;
    });
    editor.scene.ensure(editor.pageId);
    expect(reading(text).radii).toBeNull();
  });

  test('the only layer on a page has nothing to measure itself against', () => {
    editor.history.run('clear', (tx) => tx.delete(box));
    editor.scene.ensure(editor.pageId);
    expect(reading(frame).distance).toEqual({ top: null, right: null, bottom: null, left: null });
  });
});
